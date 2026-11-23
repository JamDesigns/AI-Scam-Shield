import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { VerifiedAccountIdentity } from "./account-identity.js";
import { ScanPolicyError } from "./scan-policy.js";

export type DeletionProviders = {
  deleteCustomer: (id: string) => Promise<void>;
  deleteFirebaseUser: (uid: string) => Promise<void>;
};

/** Authorize the exact principal, lock owner then devices and revoke all sessions atomically. */
export async function requestAccountDeletion(pool: pg.Pool, deviceId: string, identity: VerifiedAccountIdentity) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const account = (await db.query(`SELECT id, identity_issuer, identity_subject FROM premium_accounts
      WHERE identity_issuer=$1 AND identity_subject=$2 FOR UPDATE`, [identity.issuer, identity.subject])).rows[0];
    if (!account) throw new ScanPolicyError("account_required", 409);
    const devices = (await db.query(`SELECT id FROM devices WHERE account_id=$1 ORDER BY id FOR UPDATE`, [account.id])).rows;
    if (!devices.some(d => d.id === deviceId)) throw new ScanPolicyError("device_account_conflict", 403);
    // Existing provider calls must finish/expire before the identity can be erased.
    const busy = await db.query(`SELECT id FROM scan_operations WHERE (account_id=$1 OR device_id IN
      (SELECT id FROM devices WHERE account_id=$1)) AND status='processing'
      AND started_at > NOW()-INTERVAL '2 minutes' LIMIT 1`, [account.id]);
    if (busy.rowCount) throw new ScanPolicyError("scan_in_progress", 409);
    const ids = devices.map(d => String(d.id));
    await db.query(`INSERT INTO account_deletion_jobs(account_id,revenuecat_ids) VALUES($1,$2)
      ON CONFLICT(account_id) DO NOTHING`, [account.id, [account.id, ...ids]]);
    await db.query(`UPDATE premium_accounts SET deletion_requested_at=COALESCE(deletion_requested_at,NOW()),
      active_device_id=NULL, updated_at=NOW() WHERE id=$1`, [account.id]);
    await db.query(`UPDATE devices SET auth_token_hash=NULL WHERE account_id=$1`, [account.id]);
    await db.query("COMMIT");
    return { accepted: true, status: "deletion_pending", subscriptionsCancelled: false };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { db.release(); }
}

/** One bounded external step per lease. Provider operations must be idempotent. */
export function createAccountDeletionWorker(pool: pg.Pool, providers: DeletionProviders, onRetry?: () => void) {
  let running: Promise<void> | null = null;
  let stopped = false;
  async function run() {
    const token = randomUUID();
    const claimed = await pool.query(`WITH candidate AS (
        SELECT account_id FROM account_deletion_jobs WHERE available_at <= NOW()
          AND (lease_until IS NULL OR lease_until < NOW())
        ORDER BY available_at LIMIT 1 FOR UPDATE SKIP LOCKED
      ) UPDATE account_deletion_jobs j SET lease_token=$1, lease_until=NOW()+INTERVAL '2 minutes',
          attempts=attempts+1 FROM candidate c WHERE j.account_id=c.account_id RETURNING j.*`, [token]);
    const job = claimed.rows[0];
    if (!job) return;
    try {
      if (job.next_customer < job.revenuecat_ids.length) {
        await providers.deleteCustomer(job.revenuecat_ids[job.next_customer]);
        await pool.query(`UPDATE account_deletion_jobs SET next_customer=next_customer+1,
          lease_token=NULL,lease_until=NULL,last_error=NULL,available_at=NOW()
          WHERE account_id=$1 AND lease_token=$2`, [job.account_id, token]);
      } else if (!job.firebase_deleted) {
        const account = (await pool.query("SELECT identity_subject FROM premium_accounts WHERE id=$1", [job.account_id])).rows[0];
        if (!account) return;
        await providers.deleteFirebaseUser(account.identity_subject);
        await pool.query(`UPDATE account_deletion_jobs SET firebase_deleted=TRUE,
          lease_token=NULL,lease_until=NULL,last_error=NULL,available_at=NOW()
          WHERE account_id=$1 AND lease_token=$2`, [job.account_id, token]);
      } else {
        const db = await pool.connect();
        try {
          await db.query("BEGIN");
          await db.query("SELECT id FROM premium_accounts WHERE id=$1 FOR UPDATE", [job.account_id]);
          const valid = await db.query("SELECT account_id FROM account_deletion_jobs WHERE account_id=$1 AND lease_token=$2 FOR UPDATE", [job.account_id, token]);
          if (!valid.rowCount) { await db.query("ROLLBACK"); return; }
          await db.query("SELECT id FROM devices WHERE account_id=$1 ORDER BY id FOR UPDATE", [job.account_id]);
          // Explicit event ordering also resolves the non-cascading operation FK.
          await db.query(`DELETE FROM scan_events WHERE device_id IN (SELECT id FROM devices WHERE account_id=$1)
            OR operation_id IN (SELECT id FROM scan_operations WHERE account_id=$1)`, [job.account_id]);
          await db.query("DELETE FROM media_analysis_jobs WHERE device_id IN (SELECT id FROM devices WHERE account_id=$1)", [job.account_id]);
          await db.query("DELETE FROM scan_operations WHERE account_id=$1 OR device_id IN (SELECT id FROM devices WHERE account_id=$1)", [job.account_id]);
          await db.query("DELETE FROM devices WHERE account_id=$1", [job.account_id]);
          await db.query("DELETE FROM premium_accounts WHERE id=$1 AND deletion_requested_at IS NOT NULL", [job.account_id]);
          await db.query("COMMIT");
        } catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
        finally { db.release(); }
      }
    } catch (error) {
      // Persist only our fixed diagnostic codes, never provider bodies or identifiers.
      const message = error instanceof Error ? error.message : '';
      const diagnostic = /^(customer_deletion_http_[1-5][0-9]{2}|customer_deletion_not_confirmed|identity_deletion_unavailable)$/.test(message)
        ? message : 'deletion_step_unavailable';
      await pool.query(`UPDATE account_deletion_jobs SET lease_token=NULL,lease_until=NULL,
        available_at=NOW()+INTERVAL '5 minutes',last_error=$3
        WHERE account_id=$1 AND lease_token=$2`, [job.account_id, token, diagnostic]);
      onRetry?.();
    }
  }
  return {
    tick() {
      if (stopped || running) return running ?? Promise.resolve();
      running = run().finally(() => { running = null; });
      return running;
    },
    async stop() { stopped = true; await running; },
  };
}
