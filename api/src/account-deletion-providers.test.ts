import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), cert: vi.fn(), authDelete: vi.fn() }));
vi.mock('node:fs', () => ({ readFileSync: mocks.read }));
vi.mock('firebase-admin/app', () => ({ cert: mocks.cert, getApps: () => [], initializeApp: () => ({}) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ deleteUser: mocks.authDelete }) }));
import { createDeletionProviders } from './account-deletion-providers.js';
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
const options = { enabled: true, projectId: 'project', credentialPath: '/secret/admin.json', revenueCatKey: 'synthetic' };
function configured() {
  mocks.read.mockReturnValue(JSON.stringify({ project_id: 'project', type: 'service_account' }));
  return createDeletionProviders(options)!;
}
describe('administrative erasure adapters', () => {
  it('does not load credentials when disabled or incomplete', () => {
    expect(createDeletionProviders({ ...options, enabled: false })).toBeNull();
    expect(createDeletionProviders({ ...options, credentialPath: undefined })).toBeNull();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('rejects credentials from a different Firebase project', () => {
    mocks.read.mockReturnValue(JSON.stringify({ project_id: 'wrong', type: 'service_account' }));
    expect(createDeletionProviders(options)).toBeNull(); expect(mocks.cert).not.toHaveBeenCalled();
  });
  it('confirms RevenueCat deletion with a following 404', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 })).mockResolvedValueOnce(new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetcher);
    await configured().deleteCustomer('owner/id');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.revenuecat.com/v1/subscribers/owner%2Fid');
    expect(fetcher.mock.calls[0][1].method).toBe('DELETE');
  });
  it('does not treat permission failure as deletion success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    await expect(configured().deleteCustomer('owner')).rejects.toThrow('customer_deletion_http_403');
  });
  it('retains asynchronous deletion until absence is confirmed', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(configured().deleteCustomer('owner')).rejects.toThrow('customer_deletion_not_confirmed');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('retries idempotently when Firebase already deleted the user', async () => {
    mocks.authDelete.mockRejectedValue({ code: 'auth/user-not-found' });
    await configured().deleteFirebaseUser('subject');
    expect(mocks.authDelete).toHaveBeenCalledWith('subject');
  });
});
