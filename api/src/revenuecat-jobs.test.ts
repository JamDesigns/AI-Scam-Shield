import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { createRevenueCatWorker, recordRevenueCatEvent } from "./revenuecat-jobs.js";
import { RevenueCatSyncError, type RevenueCatWebhook } from "./revenuecat-sync.js";

function ledgerPool() {
  let ledger = new Set<string>();
  let transaction = new Set<string>();
  const queued: string[][] = [];
  const query = vi.fn(async (raw: string, values: unknown[] = []) => {
    if (raw === "BEGIN") transaction = new Set(ledger);
    if (raw === "COMMIT") ledger = transaction;
    if (raw.includes("INSERT INTO revenuecat_events")) {
      const id = String(values[0]);
      if (transaction.has(id)) return { rows: [], rowCount: 0 };
      transaction.add(id); return { rows: [{ event_id: id }], rowCount: 1 };
    }
    if (raw.includes("INSERT INTO revenuecat_sync_jobs")) {
      queued.push(values[0] as string[]); return { rows: [], rowCount: (values[0] as string[]).length };
    }
    return { rows: [], rowCount: 0 };
  });
  return { pool: { connect: async () => ({ query, release: vi.fn() }) } as unknown as pg.Pool, query, queued };
}

describe("durable RevenueCat queue", () => {
  const event: RevenueCatWebhook = { eventId: "synthetic-transfer", type: "TRANSFER", environment: null, affectedUserIds: ["old-owner", "new-owner"] };
  it("records a transfer once and refreshes both owners without app_user_id", async () => {
    const store = ledgerPool();
    expect(await recordRevenueCatEvent(store.pool, event, "PRODUCTION")).toEqual({ duplicate: false, queued: 2, ignored: false });
    expect(await recordRevenueCatEvent(store.pool, event, "PRODUCTION")).toEqual({ duplicate: true, queued: 0, ignored: false });
    expect(store.queued).toEqual([["old-owner", "new-owner"]]);
    expect(store.query.mock.calls.some(([sql]) => sql.includes("SELECT id FROM devices WHERE id = ANY"))).toBe(true);
  });
  it("records but does not apply a sandbox event to a production installation", async () => {
    const store = ledgerPool();
    expect(await recordRevenueCatEvent(store.pool, { ...event, environment: "SANDBOX" }, "PRODUCTION")).toEqual({ duplicate: false, queued: 0, ignored: true });
    expect(store.queued).toEqual([]);
  });
  it("reconciles current state and uses a lease/generation to finish safely", async () => {
    let claims = 0;
    const query = vi.fn(async (sql: string) => sql.includes("WITH candidate") && claims++ === 0
      ? { rows: [{ device_id: "owner", generation: "3", attempts: 1 }], rowCount: 1 } : { rows: [], rowCount: 0 });
    const client = { getPremiumState: vi.fn(async () => ({ isPremium: false, expiresAt: "2026-10-30T00:00:00Z", productId: "monthly", environment: "PRODUCTION" as const, observedAtMs: 3000 })) };
    const worker = createRevenueCatWorker({ query } as unknown as pg.Pool, client);
    await worker.tick(); await worker.stop();
    expect(client.getPremiumState).toHaveBeenCalledWith("owner");
    const commands = query.mock.calls.map(([sql]) => sql);
    expect(commands.some((sql) => sql.includes("FOR UPDATE SKIP LOCKED"))).toBe(true);
    expect(commands.some((sql) => sql.includes("provider_observed_at_ms < $6"))).toBe(true);
    expect(commands.some((sql) => sql.includes("generation = $3::bigint") && sql.includes("lease_token = $2"))).toBe(true);
  });
  it("retains a provider failure for retry without writing a fake premium state", async () => {
    let claims = 0;
    const query = vi.fn(async (sql: string) => sql.includes("WITH candidate") && claims++ === 0
      ? { rows: [{ device_id: "owner", generation: "1", attempts: 1 }], rowCount: 1 } : { rows: [], rowCount: 0 });
    const worker = createRevenueCatWorker({ query } as unknown as pg.Pool, { getPremiumState: vi.fn(async () => { throw new RevenueCatSyncError("network"); }) });
    await worker.tick(); await worker.stop();
    const commands = query.mock.calls.map(([sql]) => sql);
    expect(commands.some((sql) => sql.startsWith("UPDATE subscriptions"))).toBe(false);
    expect(commands.some((sql) => sql.includes("status = 'pending'") && sql.includes("last_error = $3"))).toBe(true);
  });
});
