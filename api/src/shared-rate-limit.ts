import { createHmac } from "node:crypto";
import type pg from "pg";

/** A keyed digest prevents storing raw IP addresses in enrollment counters. */
export function enrollmentSubject(ip: string, secret: string): string {
  if (secret.length < 32) throw new Error("enrollment_rate_limit_not_configured");
  return createHmac("sha256", secret).update(ip.replace(/^::ffff:/, "")).digest("hex");
}

export async function consumeSharedRateLimit(pool: Pick<pg.Pool, "query">, params: {
  scope: string; subjectHash: string; limit: number; windowSeconds: number;
}): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const result = await pool.query(`
    WITH clock AS (SELECT to_timestamp(floor(extract(epoch FROM NOW()) / $4) * $4) AS window_start),
    accepted AS (
      INSERT INTO request_rate_limits(scope, subject_hash, window_start, request_count, expires_at)
      SELECT $1, $2, window_start, 1, window_start + ($4 * INTERVAL '1 second') + INTERVAL '24 hours' FROM clock
      ON CONFLICT (scope, subject_hash, window_start) DO UPDATE
        SET request_count = request_rate_limits.request_count + 1
        WHERE request_rate_limits.request_count < $3
      RETURNING request_count
    )
    SELECT accepted.request_count IS NOT NULL AS allowed,
      GREATEST(1, ceil(extract(epoch FROM (clock.window_start + ($4 * INTERVAL '1 second') - NOW()))))::int AS retry_after_seconds
    FROM clock LEFT JOIN accepted ON TRUE`, [params.scope, params.subjectHash, params.limit, params.windowSeconds]);
  return { allowed: Boolean(result.rows[0].allowed), retryAfterSeconds: Number(result.rows[0].retry_after_seconds) };
}

export async function pruneRateLimits(pool: Pick<pg.Pool, "query">): Promise<void> {
  await pool.query("DELETE FROM request_rate_limits WHERE expires_at < NOW()");
}
