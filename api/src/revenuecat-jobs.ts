import { randomUUID } from "node:crypto";
import type pg from "pg";
import { RevenueCatClient, RevenueCatSyncError, type RevenueCatEnvironment, type RevenueCatWebhook } from "./revenuecat-sync.js";
import { persistPremiumState } from "./subscription-state.js";
import { revenueCatAppUserId } from "./premium-accounts.js";

type Queryable = Pick<pg.Pool, "query">;
export type RevenueCatJob = { deviceId: string; generation: string; leaseToken: string; attempts: number };

/** A generation counter preserves another refresh requested while a worker is in flight. */
export async function enqueueSubscriptionSync(db: Queryable, deviceIds: string[]): Promise<number> {
  if (deviceIds.length === 0) return 0;
  const result = await db.query(`INSERT INTO revenuecat_sync_jobs(device_id)
    SELECT id FROM devices WHERE id = ANY($1::text[]) OR account_id = ANY($1::text[])
    ON CONFLICT(device_id) DO UPDATE SET generation = revenuecat_sync_jobs.generation + 1,
      status = CASE WHEN revenuecat_sync_jobs.status = 'processing' THEN 'processing' ELSE 'pending' END,
      attempts = CASE WHEN revenuecat_sync_jobs.status = 'completed' THEN 0 ELSE revenuecat_sync_jobs.attempts END,
      available_at = NOW(), requested_at = NOW(), updated_at = NOW()
    RETURNING device_id`, [deviceIds]);
  return result.rowCount ?? 0;
}

export async function recordRevenueCatEvent(pool: pg.Pool, event: RevenueCatWebhook, environment: RevenueCatEnvironment) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(`INSERT INTO revenuecat_events(event_id, event_type, environment)
      VALUES ($1,$2,$3) ON CONFLICT(event_id) DO NOTHING RETURNING event_id`, [event.eventId, event.type, event.environment]);
    if (!inserted.rowCount) {
      await client.query("COMMIT");
      return { duplicate: true, queued: 0, ignored: false };
    }
    const ignored = event.type === "TEST" || event.environment !== null && event.environment !== environment;
    const queued = ignored ? 0 : await enqueueSubscriptionSync(client, event.affectedUserIds);
    await client.query("COMMIT");
    return { duplicate: false, queued, ignored };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function claimRevenueCatJob(pool: Queryable): Promise<RevenueCatJob | null> {
  const token = randomUUID();
  const result = await pool.query(`WITH candidate AS (
      SELECT device_id FROM revenuecat_sync_jobs
      WHERE available_at <= NOW() AND (status = 'pending' OR status = 'processing' AND lease_until < NOW())
      ORDER BY available_at, requested_at LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE revenuecat_sync_jobs j SET status = 'processing', attempts = attempts + 1,
      lease_token = $1, lease_until = NOW() + INTERVAL '60 seconds', updated_at = NOW()
    FROM candidate c WHERE j.device_id = c.device_id
    RETURNING j.device_id, j.generation, j.attempts`, [token]);
  const row = result.rows[0];
  return row ? { deviceId: row.device_id, generation: String(row.generation), attempts: Number(row.attempts), leaseToken: token } : null;
}

export async function enqueueStaleSubscriptionRefresh(pool: Queryable): Promise<void> {
  await pool.query(`INSERT INTO revenuecat_sync_jobs(device_id)
    SELECT s.device_id FROM subscriptions s
    WHERE s.source = 'revenuecat' AND s.verified_at < NOW() - INTERVAL '6 hours'
      AND NOT EXISTS(SELECT 1 FROM revenuecat_sync_jobs j WHERE j.device_id = s.device_id AND j.status IN ('pending','processing'))
    ORDER BY s.verified_at LIMIT 100
    ON CONFLICT(device_id) DO UPDATE SET status = 'pending', generation = revenuecat_sync_jobs.generation + 1,
      attempts = 0, available_at = NOW(), requested_at = NOW(), updated_at = NOW()
    WHERE revenuecat_sync_jobs.status = 'completed'`);
}

export async function finishRevenueCatJob(pool: Queryable, job: RevenueCatJob): Promise<void> {
  await pool.query(`UPDATE revenuecat_sync_jobs SET
      status = CASE WHEN generation = $3::bigint THEN 'completed' ELSE 'pending' END,
      completed_at = CASE WHEN generation = $3::bigint THEN NOW() ELSE NULL END,
      available_at = NOW(), lease_token = NULL, lease_until = NULL, last_error = NULL, updated_at = NOW()
    WHERE device_id = $1 AND lease_token = $2 AND status = 'processing'`, [job.deviceId, job.leaseToken, job.generation]);
}

export async function retryRevenueCatJob(pool: Queryable, job: RevenueCatJob, reason: string): Promise<void> {
  const delaySeconds = Math.min(3600, 5 * 2 ** Math.min(10, job.attempts - 1));
  await pool.query(`UPDATE revenuecat_sync_jobs SET status = 'pending', lease_token = NULL, lease_until = NULL,
      last_error = $3, available_at = NOW() + ($4 * INTERVAL '1 second'), updated_at = NOW()
    WHERE device_id = $1 AND lease_token = $2 AND status = 'processing'`, [job.deviceId, job.leaseToken, reason, delaySeconds]);
}

/** The worker performs all provider I/O after the webhook's durable acknowledgement. */
export function createRevenueCatWorker(pool: pg.Pool, client: Pick<RevenueCatClient, "getPremiumState">, options: {
  onError?: (code: string) => void;
} = {}) {
  let stopped = false;
  let running: Promise<void> | null = null;
  const run = async () => {
    await enqueueStaleSubscriptionRefresh(pool);
    // One bounded batch per tick. Multiple API replicas safely claim different rows.
    for (let index = 0; index < 10 && !stopped; index++) {
      const job = await claimRevenueCatJob(pool);
      if (!job) return;
      try {
        const expectedAppUserId = await revenueCatAppUserId(pool, job.deviceId);
        const state = await client.getPremiumState(expectedAppUserId);
        await persistPremiumState(pool, job.deviceId, state, expectedAppUserId);
        await finishRevenueCatJob(pool, job);
      } catch (error) {
        const code = error instanceof RevenueCatSyncError ? error.reason : "internal";
        await retryRevenueCatJob(pool, job, code);
        options.onError?.(code);
      }
    }
  };
  return {
    tick(): Promise<void> {
      if (stopped) return Promise.resolve();
      if (running) return running;
      running = run().catch(() => { options.onError?.("queue_unavailable"); }).finally(() => { running = null; });
      return running;
    },
    async stop() { stopped = true; if (running) await running; },
  };
}
