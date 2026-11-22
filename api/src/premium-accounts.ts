import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { VerifiedAccountIdentity } from "./account-identity.js";
import type { PremiumEntitlementState, RevenueCatClient } from "./revenuecat-sync.js";
import { ScanPolicyError } from "./scan-policy.js";
import { subscriptionEnvironment } from "./subscription-state.js";

type Queryable = Pick<pg.Pool, "query">;
export type PremiumAccount = { id: string; activeDeviceId: string | null; timeZone: string };

export async function getDeviceAccount(db: Queryable, deviceId: string): Promise<PremiumAccount | null> {
  const row = (await db.query(`SELECT a.id, a.active_device_id, a.time_zone FROM premium_accounts a
    JOIN devices d ON d.account_id = a.id WHERE d.id = $1`, [deviceId])).rows[0];
  return row ? { id: row.id, activeDeviceId: row.active_device_id, timeZone: row.time_zone } : null;
}
export async function revenueCatAppUserId(db: Queryable, deviceId: string): Promise<string> {
  return (await getDeviceAccount(db, deviceId))?.id ?? deviceId;
}

/** Both link and activation use owner -> device locks, the same order as scan reservations. */
export async function linkVerifiedAccount(pool: pg.Pool, deviceId: string, identity: VerifiedAccountIdentity): Promise<PremiumAccount> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`INSERT INTO premium_accounts(id, identity_issuer, identity_subject, time_zone)
      SELECT $1,$2,$3,time_zone FROM devices WHERE id = $4 ON CONFLICT(identity_issuer, identity_subject) DO NOTHING`,
      [randomUUID(), identity.issuer, identity.subject, deviceId]);
    const account = (await db.query(`SELECT id, active_device_id, time_zone, deletion_requested_at FROM premium_accounts
      WHERE identity_issuer = $1 AND identity_subject = $2 FOR UPDATE`, [identity.issuer, identity.subject])).rows[0];
    if (!account) throw new ScanPolicyError("account_unavailable", 503);
    if (account.deletion_requested_at) throw new ScanPolicyError("account_deletion_pending", 409);
    const device = (await db.query("SELECT id, account_id FROM devices WHERE id = $1 FOR UPDATE", [deviceId])).rows[0];
    if (!device || device.account_id && device.account_id !== account.id) throw new ScanPolicyError("device_account_conflict", 409);
    // Do not bind a running anonymous operation to a different accounting owner mid-flight.
    if (!device.account_id && (await db.query("SELECT id FROM scan_operations WHERE device_id = $1 AND status = 'processing' LIMIT 1", [deviceId])).rowCount) throw new ScanPolicyError("scan_in_progress", 409);
    if (!device.account_id) {
      await db.query("UPDATE devices SET account_id = $2 WHERE id = $1", [deviceId, account.id]);
      // Import pre-login usage once per installation. Signing in does not mint fresh free scans.
      await db.query(`INSERT INTO account_weekly_usage(account_id, year_week, scans_count, ai_scans_count)
        SELECT $2, to_char(date_trunc('week', created_at AT TIME ZONE $3), 'IYYY-"W"IW'),
          COUNT(*)::int, COUNT(*) FILTER(WHERE ai_used)::int FROM scan_events
        WHERE device_id = $1 AND operation_id IN (SELECT id FROM scan_operations WHERE device_id = $1 AND is_premium = FALSE)
        GROUP BY to_char(date_trunc('week', created_at AT TIME ZONE $3), 'IYYY-"W"IW')
        ON CONFLICT(account_id, year_week) DO UPDATE SET scans_count = account_weekly_usage.scans_count + EXCLUDED.scans_count,
          ai_scans_count = account_weekly_usage.ai_scans_count + EXCLUDED.ai_scans_count`, [deviceId, account.id, account.time_zone]);
      // Old releases may have counters without operation-linked events. Their exact instants are
      // unavailable: conservatively charge residual usage from device weeks intersecting this
      // owner week to the current owner week. This may reduce the first week's remaining quota,
      // but changing time zone/phone can never manufacture another first-AI analysis.
      await db.query(`WITH owner_week AS (
          SELECT date_trunc('week', clock_timestamp() AT TIME ZONE $3) AT TIME ZONE $3 AS starts,
            (date_trunc('week', clock_timestamp() AT TIME ZONE $3) + INTERVAL '1 week') AT TIME ZONE $3 AS ends
        ), known AS (
          SELECT year_week, COUNT(*)::int AS scans, COUNT(*) FILTER(WHERE ai_used)::int AS ai
          FROM scan_operations WHERE device_id = $1 AND status = 'completed' AND is_premium = FALSE GROUP BY year_week
        ), residual AS (
          SELECT GREATEST(u.scans_count - COALESCE(k.scans, 0), 0) AS scans,
            GREATEST(u.ai_scans_count - COALESCE(k.ai, 0), 0) AS ai
          FROM device_weekly_usage u JOIN devices d ON d.id = u.device_id CROSS JOIN owner_week w
          LEFT JOIN known k ON k.year_week = u.year_week
          WHERE u.device_id = $1 AND u.year_week IN (
            to_char(w.starts AT TIME ZONE d.time_zone, 'IYYY-"W"IW'),
            to_char((w.ends - INTERVAL '1 microsecond') AT TIME ZONE d.time_zone, 'IYYY-"W"IW'))
        ) INSERT INTO account_weekly_usage(account_id, year_week, scans_count, ai_scans_count)
          SELECT $2, to_char(date_trunc('week', clock_timestamp() AT TIME ZONE $3), 'IYYY-"W"IW'),
            SUM(scans)::int, SUM(ai)::int FROM residual HAVING SUM(scans) > 0
          ON CONFLICT(account_id, year_week) DO UPDATE SET scans_count = account_weekly_usage.scans_count + EXCLUDED.scans_count,
            ai_scans_count = account_weekly_usage.ai_scans_count + EXCLUDED.ai_scans_count`, [deviceId, account.id, account.time_zone]);
    }
    await db.query("COMMIT");
    return { id: account.id, activeDeviceId: account.active_device_id, timeZone: account.time_zone };
  } catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
  finally { db.release(); }
}

function requirePremium(state: PremiumEntitlementState) {
  if (!state.isPremium || state.environment !== subscriptionEnvironment() || state.expiresAt !== null && Date.parse(state.expiresAt) <= Date.now()) throw new ScanPolicyError("premium_not_verified", 403);
}

export async function activatePremiumDevice(pool: pg.Pool, client: Pick<RevenueCatClient, "getPremiumState">, deviceId: string,
  identity: VerifiedAccountIdentity, confirm: boolean): Promise<PremiumAccount> {
  if (!confirm) throw new ScanPolicyError("device_activation_confirmation_required", 409);
  if (Date.now() / 1000 - identity.authenticatedAt > 300) throw new ScanPolicyError("account_reauthentication_required", 401);
  const account = await getDeviceAccount(pool, deviceId);
  if (!account) throw new ScanPolicyError("account_required", 403);
  // Provider I/O runs outside any transaction. Only the stable owner ID is queried.
  const state = await client.getPremiumState(account.id);
  requirePremium(state);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const owner = (await db.query(`SELECT id FROM premium_accounts WHERE id = $1 AND identity_issuer = $2 AND identity_subject = $3 AND deletion_requested_at IS NULL FOR UPDATE`, [account.id, identity.issuer, identity.subject])).rows[0];
    if (!owner) throw new ScanPolicyError("account_identity_mismatch", 403);
    const device = (await db.query("SELECT account_id FROM devices WHERE id = $1 FOR UPDATE", [deviceId])).rows[0];
    if (device?.account_id !== account.id) throw new ScanPolicyError("account_identity_mismatch", 403);
    // An in-flight scan keeps the old activation until its bounded operation ends.
    await db.query(`UPDATE scan_operations SET status = 'failed', completed_at = NOW()
      WHERE account_id = $1 AND status = 'processing' AND started_at < NOW() - INTERVAL '10 minutes'`, [account.id]);
    if ((await db.query("SELECT id FROM scan_operations WHERE account_id = $1 AND status = 'processing' LIMIT 1", [account.id])).rowCount) throw new ScanPolicyError("scan_in_progress", 409);
    requirePremium(state);
    const newer = await db.query(`SELECT 1 FROM subscriptions WHERE device_id IN (SELECT id FROM devices WHERE account_id = $1)
      AND provider_observed_at_ms > $2 LIMIT 1`, [account.id, state.observedAtMs]);
    if (newer.rowCount) throw new ScanPolicyError("subscription_sync_pending", 503);
    await db.query(`UPDATE subscriptions SET is_premium = $2, expires_at = $3, product_id = $4, environment = $5,
      provider_observed_at_ms = $6, verified_at = NOW(), source = 'revenuecat', updated_at = NOW()
      WHERE device_id IN (SELECT id FROM devices WHERE account_id = $1)
        AND (provider_observed_at_ms IS NULL OR provider_observed_at_ms <= $6)`,
      [account.id, state.isPremium, state.expiresAt, state.productId, state.environment, state.observedAtMs]);
    await db.query("UPDATE premium_accounts SET active_device_id = $2, updated_at = NOW() WHERE id = $1", [account.id, deviceId]);
    await db.query("COMMIT");
    return { ...account, activeDeviceId: deviceId };
  } catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
  finally { db.release(); }
}
