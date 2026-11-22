import type pg from "pg";
import type { PremiumEntitlementState, RevenueCatEnvironment } from "./revenuecat-sync.js";

/** One effective-access predicate is shared by status, quota reservation and scan results. */
export function premiumSql(alias = "s", allowTestAdmin = false, environmentParameter = "$2"): string {
  return `(${alias}.is_premium AND ${alias}.verified_at IS NOT NULL AND ${alias}.environment = ${environmentParameter}
    AND (${alias}.expires_at IS NULL OR ${alias}.expires_at > clock_timestamp())
    AND ((${alias}.source = 'revenuecat' AND EXISTS (
      SELECT 1 FROM devices owner_device JOIN premium_accounts owner_account ON owner_account.id = owner_device.account_id
      WHERE owner_device.id = ${alias}.device_id AND owner_account.active_device_id = owner_device.id
    ))${allowTestAdmin ? ` OR ${alias}.source = 'test_admin'` : ""}))`;
}

export function subscriptionEnvironment(): RevenueCatEnvironment {
  return process.env.REVENUECAT_ENVIRONMENT === "SANDBOX" ? "SANDBOX" : "PRODUCTION";
}

export function testAdminEnabled(): boolean {
  return process.env.ALLOW_TEST_ADMIN === "true" && process.env.NODE_ENV !== "production" && subscriptionEnvironment() === "SANDBOX";
}

export async function persistPremiumState(pool: Pick<pg.Pool, "query">, deviceId: string, state: PremiumEntitlementState,
  expectedAppUserId = deviceId): Promise<boolean> {
  const result = await pool.query(`UPDATE subscriptions SET is_premium = $2, expires_at = $3,
    product_id = $4, environment = $5, provider_observed_at_ms = $6, verified_at = NOW(), source = 'revenuecat', updated_at = NOW()
    WHERE device_id IN (SELECT id FROM devices WHERE account_id = (SELECT account_id FROM devices WHERE id = $1)
      UNION SELECT $1::text WHERE (SELECT account_id FROM devices WHERE id = $1) IS NULL)
      AND EXISTS(SELECT 1 FROM devices request_device WHERE request_device.id = $1
        AND COALESCE(request_device.account_id, request_device.id) = $7)
      AND (provider_observed_at_ms IS NULL OR provider_observed_at_ms < $6)
    RETURNING device_id`, [deviceId, state.isPremium, state.expiresAt, state.productId, state.environment, state.observedAtMs, expectedAppUserId]);
  return (result.rowCount ?? 0) > 0;
}

export async function readSubscriptionStatus(pool: Pick<pg.Pool, "query">, deviceId: string, environment = subscriptionEnvironment()) {
  const result = await pool.query(`SELECT ${premiumSql("s", testAdminEnabled())} AS is_premium,
      s.expires_at, s.environment, s.verified_at, s.source,
      EXISTS(SELECT 1 FROM revenuecat_sync_jobs j WHERE j.device_id = s.device_id AND j.status IN ('pending','processing')) AS sync_pending
    FROM subscriptions s WHERE s.device_id = $1`, [deviceId, environment]);
  const row = result.rows[0];
  return { isPremium: Boolean(row?.is_premium), expiresAt: row?.expires_at ? new Date(row.expires_at).toISOString() : null,
    environment, syncedAt: row?.verified_at ? new Date(row.verified_at).toISOString() : null,
    source: row?.source ?? null, syncPending: Boolean(row?.sync_pending) };
}
