import { describe, expect, it, vi } from 'vitest';
import { requestAccountDeletion, createAccountDeletionWorker } from './account-deletion.js';

const identity = { issuer: 'issuer', subject: 'owner-subject', authenticatedAt: 1 };
function database(options: { busy?: boolean; device?: string; account?: boolean } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT id, identity_issuer')) return { rows: options.account === false ? [] : [{ id: 'owner' }] };
    if (sql.includes("status='processing'")) return { rows: [], rowCount: options.busy ? 1 : 0 };
    if (sql.startsWith('SELECT id FROM devices')) return { rows: [{ id: options.device ?? 'installation' }, { id: 'second-phone' }] };
    return { rows: [], rowCount: 1 };
  });
  const release = vi.fn();
  return { query, release, pool: { connect: async () => ({ query, release }) } as never };
}
describe('account deletion ownership and transactional revocation', () => {
  it('refuses a different installation without revoking anyone', async () => {
    const db = database({ device: 'other' });
    await expect(requestAccountDeletion(db.pool, 'installation', identity)).rejects.toThrow('device_account_conflict');
    expect(db.query.mock.calls.some(([sql]) => sql.includes('UPDATE devices'))).toBe(false);
    expect(db.query).toHaveBeenCalledWith('ROLLBACK');
  });
  it('refuses an unknown principal', async () => {
    const db = database({ account: false });
    await expect(requestAccountDeletion(db.pool, 'installation', identity)).rejects.toThrow('account_required');
  });
  it('waits for a running scan and leaves sessions intact', async () => {
    const db = database({ busy: true });
    await expect(requestAccountDeletion(db.pool, 'installation', identity)).rejects.toThrow('scan_in_progress');
    expect(db.query.mock.calls.some(([sql]) => sql.includes('UPDATE devices'))).toBe(false);
  });
  it('records durable cleanup and revokes every linked session before accepting', async () => {
    const db = database();
    const result = await requestAccountDeletion(db.pool, 'installation', identity);
    expect(result).toMatchObject({ accepted: true, status: 'deletion_pending', subscriptionsCancelled: false });
    const sql = db.query.mock.calls.map(([text]) => text).join('\n');
    expect(sql).toContain('INSERT INTO account_deletion_jobs');
    expect(sql).toContain('auth_token_hash=NULL WHERE account_id=$1');
    expect(db.query.mock.calls.at(-1)).toEqual(['COMMIT']);
    expect(db.release).toHaveBeenCalledOnce();
  });
});
describe('durable provider cleanup', () => {
  it('retains the job on provider failure with a sanitized retry code', async () => {
    const query = vi.fn(async (sql: string) => sql.startsWith('WITH candidate')
      ? { rows: [{ account_id: 'owner', revenuecat_ids: ['owner'], next_customer: 0, firebase_deleted: false }] }
      : { rows: [], rowCount: 1 });
    const onRetry = vi.fn();
    const firebase = vi.fn();
    const worker = createAccountDeletionWorker({ query } as never, {
      deleteCustomer: async () => { throw Error('confidential provider details'); }, deleteFirebaseUser: firebase,
    }, onRetry);
    await worker.tick();
    expect(firebase).not.toHaveBeenCalled();
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).toContain('last_error=$3');
    expect(query).toHaveBeenLastCalledWith(expect.any(String), ['owner', expect.any(String), 'deletion_step_unavailable']);
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).not.toContain('confidential');
    expect(onRetry).toHaveBeenCalledOnce();
    await worker.stop();
  });
  it('does not overlap ticks on the same worker', async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const query = vi.fn(async () => { await blocked; return { rows: [] }; });
    const worker = createAccountDeletionWorker({ query } as never, { deleteCustomer: vi.fn(), deleteFirebaseUser: vi.fn() });
    const one = worker.tick(); const two = worker.tick();
    expect(query).toHaveBeenCalledOnce();
    release(); await Promise.all([one, two]); await worker.stop();
  });
});
