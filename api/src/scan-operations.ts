import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { InsertScanEventParams } from "./db.js";
import { buildUsageResponse, ScanPolicyError, selectScanMode, type ScanKind } from "./scan-policy.js";
import { premiumSql, subscriptionEnvironment, testAdminEnabled } from "./subscription-state.js";
import { getDeviceAccount } from "./premium-accounts.js";

type Queryable = Pick<pg.Pool, "query">;
export type TimeContext = {
  timeZone: string;
  yearWeek: string;
  asOf: string;
  todayStartAt: string;
  weekStartAt: string;
  monthStartAt: string;
  yearStartAt: string;
  resetAt: string;
};

const iso = (value: unknown) => new Date(value as string | Date).toISOString();

// PostgreSQL applies IANA DST rules to local calendar boundaries, including midnight transitions.
export async function getTimeContext(db: Queryable, timeZone: string, now = new Date()): Promise<TimeContext> {
  const result = await db.query(`
    WITH clock AS (SELECT $1::timestamptz AS instant, $1::timestamptz AT TIME ZONE $2 AS local_now)
    SELECT instant AS as_of,
      to_char(date_trunc('week', local_now), 'IYYY-"W"IW') AS year_week,
      date_trunc('day', local_now) AT TIME ZONE $2 AS today_start,
      date_trunc('week', local_now) AT TIME ZONE $2 AS week_start,
      (date_trunc('day', local_now) - INTERVAL '29 days') AT TIME ZONE $2 AS month_start,
      date_trunc('year', local_now) AT TIME ZONE $2 AS year_start,
      (date_trunc('week', local_now) + INTERVAL '1 week') AT TIME ZONE $2 AS reset_at
    FROM clock`, [now.toISOString(), timeZone]);
  const row = result.rows[0];
  return {
    timeZone, yearWeek: String(row.year_week), asOf: iso(row.as_of),
    todayStartAt: iso(row.today_start), weekStartAt: iso(row.week_start),
    monthStartAt: iso(row.month_start), yearStartAt: iso(row.year_start), resetAt: iso(row.reset_at),
  };
}

export async function getUsageSnapshot(db: Queryable, deviceId: string, context: TimeContext, weeklyLimit = 3) {
  const result = await db.query(`
    SELECT ${premiumSql("s", testAdminEnabled(), "$3")} AS is_premium,
      COALESCE(CASE WHEN d.account_id IS NOT NULL THEN au.scans_count ELSE u.scans_count END, 0) AS scans_count,
      COALESCE(CASE WHEN d.account_id IS NOT NULL THEN au.ai_scans_count ELSE u.ai_scans_count END, 0) AS ai_scans_count,
      EXISTS(SELECT 1 FROM subscriptions owner_s JOIN devices owner_d ON owner_d.id = owner_s.device_id
        WHERE owner_d.account_id = d.account_id AND owner_s.is_premium AND owner_s.verified_at IS NOT NULL
          AND owner_s.environment = $3 AND owner_s.source = 'revenuecat'
          AND (owner_s.expires_at IS NULL OR owner_s.expires_at > clock_timestamp())) AS account_premium_active,
      EXISTS(SELECT 1 FROM revenuecat_sync_jobs j WHERE j.device_id = s.device_id AND j.status IN ('pending','processing')) AS sync_pending
    FROM subscriptions s JOIN devices d ON d.id = s.device_id
      LEFT JOIN device_weekly_usage u ON u.device_id = s.device_id AND u.year_week = $2
      LEFT JOIN account_weekly_usage au ON au.account_id = d.account_id AND au.year_week = $2
    WHERE s.device_id = $1`, [deviceId, context.yearWeek, subscriptionEnvironment()]);
  const row = result.rows[0] ?? {};
  return { ...buildUsageResponse({
    isPremium: Boolean(row.is_premium), totalWeeklyUsed: Number(row.scans_count ?? 0),
    aiWeeklyUsed: Number(row.ai_scans_count ?? 0), weeklyLimit,
    resetAt: context.resetAt, timeZone: context.timeZone,
  }), subscriptionSyncPending: Boolean(row.sync_pending), accountPremiumActive: Boolean(row.account_premium_active) };
}

export type ScanReservation = {
  id: string;
  leaseToken: string;
  deviceId: string;
  kind: ScanKind;
  aiUsed: boolean;
  isPremium: boolean;
  ordinal: number | null;
  context: TimeContext;
  accountId?: string | null;
};
export type ReservationResult =
  | { replay: true; statusCode: number; response: Record<string, unknown> }
  | { replay: false; operation: ScanReservation };

export async function reserveScanOperation(pool: pg.Pool, params: {
  deviceId: string; idempotencyKey: string; requestHash: string; kind: ScanKind; timeZone: string; weeklyLimit: number;
}): Promise<ReservationResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // All reservation/completion/failure transitions take this lock first. It serializes a device across API replicas.
    const account = await lockScanOwner(client, params.deviceId);
    const context = await getTimeContext(client, account?.timeZone ?? params.timeZone);
    const usage = await getUsageSnapshot(client, params.deviceId, context, params.weeklyLimit);
    if (account && account.activeDeviceId !== null && account.activeDeviceId !== params.deviceId && usage.accountPremiumActive) {
      throw new ScanPolicyError("premium_device_inactive", 403);
    }
    const previous = (await client.query(
      "SELECT * FROM scan_operations WHERE device_id = $1 AND idempotency_key = $2", [params.deviceId, params.idempotencyKey],
    )).rows[0];
    if (previous && previous.request_hash !== params.requestHash) {
      throw new ScanPolicyError("idempotency_conflict", 409);
    }
    if (previous?.status === "completed") {
      await client.query("COMMIT");
      return { replay: true, statusCode: Number(previous.response_status), response: previous.response_json };
    }
    // Reservations have a bounded lease; failures and restarts do not permanently spend the first free scan.
    await client.query(`UPDATE scan_operations SET status = 'failed', completed_at = NOW()
      WHERE (device_id = $1 OR account_id = $2) AND status = 'processing' AND started_at < NOW() - INTERVAL '10 minutes'`, [params.deviceId, account?.id ?? null]);
    const pending = (await client.query(
      "SELECT id FROM scan_operations WHERE (device_id = $1 OR account_id = $2) AND status = 'processing' LIMIT 1", [params.deviceId, account?.id ?? null],
    )).rows[0];
    if (pending) throw new ScanPolicyError("scan_in_progress", 409, { operationId: pending.id, retryAfterMs: 3000 });
    if (!usage.isPremium && usage.subscriptionSyncPending) throw new ScanPolicyError("subscription_sync_pending", 503);
    let mode;
    try {
      mode = selectScanMode({ isPremium: usage.isPremium, completedFreeScans: usage.totalWeeklyUsed, kind: params.kind, weeklyLimit: params.weeklyLimit });
    } catch (error) {
      if (error instanceof ScanPolicyError) error.details.resetAt = context.resetAt;
      throw error;
    }
    const id = previous?.id ?? randomUUID();
    const leaseToken = randomUUID();
    await client.query(`INSERT INTO scan_operations
      (id, device_id, idempotency_key, request_hash, input_type, status, year_week, time_zone, ai_used, is_premium, ordinal, lease_token, account_id)
      VALUES ($1,$2,$3,$4,$5,'processing',$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (device_id, idempotency_key) DO UPDATE SET status = 'processing', year_week = EXCLUDED.year_week,
        time_zone = EXCLUDED.time_zone, ai_used = EXCLUDED.ai_used, is_premium = EXCLUDED.is_premium,
        ordinal = EXCLUDED.ordinal, lease_token = EXCLUDED.lease_token, account_id = EXCLUDED.account_id,
        started_at = NOW(), completed_at = NULL, response_json = NULL, response_status = NULL`,
      [id, params.deviceId, params.idempotencyKey, params.requestHash, params.kind, context.yearWeek, context.timeZone, mode.aiUsed, usage.isPremium, mode.ordinal, leaseToken, account?.id ?? null]);
    await client.query("COMMIT");
    return { replay: false, operation: { id, leaseToken, deviceId: params.deviceId, kind: params.kind, ...mode, isPremium: usage.isPremium, context, accountId: account?.id ?? null } };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function completeScanOperation(pool: pg.Pool, operation: ScanReservation, event: Omit<InsertScanEventParams, "id" | "deviceId">,
  response: Record<string, unknown>, weeklyLimit: number,
  mediaJob?: { providerSubmissionId?: string; result: unknown }, deadlineAt?: number): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  const checkDeadline = () => { if (deadlineAt !== undefined && Date.now() >= deadlineAt) throw new ScanPolicyError("operation_timeout", 503); };
  try {
    await client.query("BEGIN");
    checkDeadline();
    if (deadlineAt !== undefined) await client.query("SELECT set_config('statement_timeout', $1, true)", [String(Math.max(1, deadlineAt - Date.now()))]);
    const owner = await lockScanOwner(client, operation.deviceId);
    if (operation.isPremium && owner && owner.activeDeviceId !== operation.deviceId) throw new ScanPolicyError("premium_device_inactive", 403);
    const row = (await client.query("SELECT status, response_json, lease_token FROM scan_operations WHERE id = $1 AND device_id = $2 FOR UPDATE", [operation.id, operation.deviceId])).rows[0];
    if (!row || row.lease_token !== operation.leaseToken) throw new ScanPolicyError("operation_expired", 409);
    if (row?.status === "completed") {
      await client.query("COMMIT");
      return row.response_json;
    }
    if (row?.status !== "processing") throw new ScanPolicyError("operation_expired", 409);
    checkDeadline();
    await client.query(`INSERT INTO scan_events (id, device_id, input_preview, final_category, threat_type, final_risk_score,
      classic_category, classic_risk_score, ai_used, is_threat, input_type, operation_id, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$1,$12)`,
      [operation.id, operation.deviceId, event.inputPreview, event.finalCategory, event.threatType, event.finalRiskScore,
        event.classicCategory, event.classicRiskScore, operation.aiUsed, event.isThreat, operation.kind, operation.context.asOf]);
    if (!operation.isPremium) {
      await client.query(`INSERT INTO device_weekly_usage(device_id, year_week, scans_count, ai_scans_count)
        VALUES ($1,$2,1,$3) ON CONFLICT (device_id, year_week) DO UPDATE SET
        scans_count = device_weekly_usage.scans_count + 1, ai_scans_count = device_weekly_usage.ai_scans_count + EXCLUDED.ai_scans_count, updated_at = NOW()`,
        [operation.deviceId, operation.context.yearWeek, operation.aiUsed ? 1 : 0]);
      if (operation.accountId) await client.query(`INSERT INTO account_weekly_usage(account_id, year_week, scans_count, ai_scans_count)
        VALUES($1,$2,1,$3) ON CONFLICT(account_id, year_week) DO UPDATE SET
        scans_count = account_weekly_usage.scans_count + 1,
        ai_scans_count = account_weekly_usage.ai_scans_count + EXCLUDED.ai_scans_count`,
      [operation.accountId, operation.context.yearWeek, operation.aiUsed ? 1 : 0]);
    }
    if (mediaJob) {
      await client.query(`UPDATE media_analysis_jobs SET status = 'completed', provider_submission_id = COALESCE($3, provider_submission_id),
        result_json = $4::jsonb, error_message = NULL, updated_at = NOW(), completed_at = NOW()
        WHERE id = $1 AND device_id = $2`, [operation.id, operation.deviceId, mediaJob.providerSubmissionId ?? null, JSON.stringify(mediaJob.result)]);
    }
    const usage = await getUsageSnapshot(client, operation.deviceId, operation.context, weeklyLimit);
    const result = { ...response, ...usage, aiUsed: operation.aiUsed, aiAllowed: operation.aiUsed, operationId: operation.id };
    checkDeadline();
    await client.query("UPDATE scan_operations SET status = 'completed', response_status = 200, response_json = $2::jsonb, completed_at = NOW() WHERE id = $1", [operation.id, JSON.stringify(result)]);
    checkDeadline();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    if (deadlineAt !== undefined && (Date.now() >= deadlineAt || (error as { code?: string }).code === "57014")) throw new ScanPolicyError("operation_timeout", 503);
    throw error;
  } finally {
    client.release();
  }
}

export async function failScanOperation(pool: pg.Pool, operation: ScanReservation): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockScanOwner(client, operation.deviceId);
    await client.query("UPDATE scan_operations SET status = 'failed', completed_at = NOW() WHERE id = $1 AND device_id = $2 AND lease_token = $3 AND status = 'processing'", [operation.id, operation.deviceId, operation.leaseToken]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Owner lock also serializes free usage and activation across installations and API replicas. */
async function lockScanOwner(db: pg.PoolClient, deviceId: string) {
  const account = await getDeviceAccount(db, deviceId);
  if (account) {
    const row = (await db.query("SELECT active_device_id, deletion_requested_at FROM premium_accounts WHERE id = $1 FOR UPDATE", [account.id])).rows[0];
    if (row?.deletion_requested_at) throw new ScanPolicyError("account_deletion_pending", 409);
    if (!row) throw new ScanPolicyError("account_unavailable", 503);
    account.activeDeviceId = row.active_device_id;
  }
  const device = (await db.query("SELECT id, account_id FROM devices WHERE id = $1 FOR UPDATE", [deviceId])).rows[0];
  if (!device || (device.account_id ?? null) !== (account?.id ?? null)) throw new ScanPolicyError("account_binding_changed", 409);
  return account;
}
