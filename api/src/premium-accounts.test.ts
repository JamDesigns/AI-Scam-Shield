import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { activatePremiumDevice, revenueCatAppUserId } from "./premium-accounts.js";
import { reserveScanOperation } from "./scan-operations.js";
import type { PremiumEntitlementState } from "./revenuecat-sync.js";

const identity = () => ({ issuer: "https://securetoken.google.com/synthetic-project", subject: "google-user", authenticatedAt: Math.floor(Date.now() / 1000) });
const entitlement = (overrides: Partial<PremiumEntitlementState> = {}): PremiumEntitlementState => ({ isPremium: true,
  expiresAt: new Date(Date.now() + 3600000).toISOString(), productId: "monthly", environment: "PRODUCTION", observedAtMs: Date.now(), ...overrides });

/** A blocking row-lock double: activation and reservation share a real asynchronous mutex. No external DB. */
class Store {
  active = "old-phone";
  pending: string | null = null;
  latestObservation = 0;
  paid = true;
  calls: string[] = [];
  tail = Promise.resolve();
  query = async (raw: string, values: unknown[] = []) => this.read(raw, values);
  read(raw: string, values: unknown[]) {
    const sql = raw.replace(/\s+/g, " ").trim();
    const rows = (items: unknown[] = []) => ({ rows: items, rowCount: items.length });
    if (sql.startsWith("SELECT a.id, a.active_device_id")) return rows([{ id: "owner", active_device_id: this.active, time_zone: "Europe/Madrid" }]);
    if (sql.startsWith("SELECT account_id FROM devices") || sql.startsWith("SELECT id, account_id FROM devices")) return rows([{ id: values[0], account_id: "owner" }]);
    if (sql.startsWith("SELECT id FROM scan_operations")) return rows(this.pending ? [{ id: this.pending }] : []);
    if (sql.startsWith("SELECT 1 FROM subscriptions")) return rows(this.latestObservation > Number(values[1]) ? [{}] : []);
    if (sql.startsWith("UPDATE subscriptions")) { this.latestObservation = Number(values[5]); return rows([{}]); }
    if (sql.startsWith("UPDATE premium_accounts")) { this.active = String(values[1]); return rows([{}]); }
    if (sql.startsWith("UPDATE scan_operations SET status = 'failed'")) return rows();
    if (sql.startsWith("SELECT * FROM scan_operations")) return rows();
    if (sql.startsWith("WITH clock AS")) return rows([{ as_of: "2026-11-22T12:00:00Z", year_week: "2026-W47", today_start: "2026-11-21T23:00:00Z", week_start: "2026-11-15T23:00:00Z", month_start: "2026-10-23T22:00:00Z", year_start: "2025-12-31T23:00:00Z", reset_at: "2026-11-22T23:00:00Z" }]);
    if (sql.includes("FROM subscriptions s JOIN devices")) return rows([{ is_premium: this.paid && this.active === values[0], account_premium_active: this.paid,
      scans_count: 0, ai_scans_count: 0, sync_pending: false }]);
    if (sql.startsWith("INSERT INTO scan_operations")) { this.pending = String(values[0]); return rows(); }
    throw new Error(`Unexpected synthetic query: ${sql}`);
  }
  async connect() {
    let release: (() => void) | undefined;
    let snapshot: { active: string; pending: string | null; latestObservation: number } | undefined;
    const unlock = () => { release?.(); release = undefined; };
    return { release: unlock, query: async (raw: string, values: unknown[] = []) => {
      const sql = raw.replace(/\s+/g, " ").trim(); this.calls.push(sql);
      const rows = (items: unknown[] = []) => ({ rows: items, rowCount: items.length });
      if (sql === "BEGIN") return rows();
      if (sql === "COMMIT") { unlock(); return rows(); }
      if (sql === "ROLLBACK") { if (snapshot) Object.assign(this, snapshot); unlock(); return rows(); }
      if (sql.includes("FROM premium_accounts WHERE") && sql.endsWith("FOR UPDATE")) {
        const previous = this.tail; this.tail = new Promise<void>((resolve) => { release = resolve; }); await previous;
        snapshot = { active: this.active, pending: this.pending, latestObservation: this.latestObservation };
        if (values.length > 1 && values[2] !== identity().subject) return rows();
        return rows([{ id: "owner", active_device_id: this.active }]);
      }
      return this.read(sql, values);
    } };
  }
  pool() { return this as unknown as pg.Pool; }
}
const reserve = (store: Store, deviceId: string) => reserveScanOperation(store.pool(), { deviceId, kind: "video", requestHash: "synthetic-hash", idempotencyKey: "synthetic-idempotency", timeZone: "UTC", weeklyLimit: 3 });

describe("one active Premium terminal", () => {
  it("uses a stable owner ID in RevenueCat and immediately denies the former terminal", async () => {
    const store = new Store(); const client = { getPremiumState: vi.fn(async () => entitlement()) };
    expect(await revenueCatAppUserId(store.pool(), "new-phone")).toBe("owner");
    await activatePremiumDevice(store.pool(), client, "new-phone", identity(), true);
    expect(client.getPremiumState).toHaveBeenCalledWith("owner");
    await expect(reserve(store, "old-phone")).rejects.toMatchObject({ code: "premium_device_inactive" });
    const current = await reserve(store, "new-phone");
    expect(current.replay).toBe(false);
    if (!current.replay) expect(current.operation).toMatchObject({ accountId: "owner", isPremium: true, aiUsed: true, context: { timeZone: "Europe/Madrid" } });
  });
  it("serializes simultaneous activations and permits scans only on the final active terminal", async () => {
    const store = new Store(); const client = { getPremiumState: vi.fn(async () => entitlement()) };
    await Promise.all([activatePremiumDevice(store.pool(), client, "new-phone", identity(), true), activatePremiumDevice(store.pool(), client, "third-phone", identity(), true)]);
    expect(["new-phone", "third-phone"]).toContain(store.active);
    const results = await Promise.allSettled([reserve(store, "new-phone"), reserve(store, "third-phone")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("does not transfer while an owner analysis is in flight", async () => {
    const store = new Store(); await reserve(store, "old-phone");
    await expect(activatePremiumDevice(store.pool(), { getPremiumState: async () => entitlement() }, "new-phone", identity(), true)).rejects.toMatchObject({ code: "scan_in_progress" });
    expect(store.active).toBe("old-phone");
  });
  it("permits the shared free allowance on a new phone after paid access expires", async () => {
    const store = new Store(); store.paid = false;
    const result = await reserve(store, "new-phone");
    expect(result.replay).toBe(false);
    if (!result.replay) expect(result.operation).toMatchObject({ isPremium: false, aiUsed: true, ordinal: 1, accountId: "owner" });
  });
  it.each([{ isPremium: false }, { environment: "SANDBOX" as const }, { expiresAt: new Date(0).toISOString() }])("does not transfer for an invalid entitlement %j", async (state) => {
    const store = new Store();
    await expect(activatePremiumDevice(store.pool(), { getPremiumState: async () => entitlement(state) }, "new-phone", identity(), true)).rejects.toMatchObject({ code: "premium_not_verified" });
    expect(store.active).toBe("old-phone");
  });
  it("rejects stale observations, wrong identity and missing explicit confirmation", async () => {
    const store = new Store(); store.latestObservation = Date.now() + 10000;
    await expect(activatePremiumDevice(store.pool(), { getPremiumState: async () => entitlement() }, "new-phone", identity(), true)).rejects.toMatchObject({ code: "subscription_sync_pending" });
    store.latestObservation = 0;
    await expect(activatePremiumDevice(store.pool(), { getPremiumState: async () => entitlement() }, "new-phone", { ...identity(), subject: "other-user" }, true)).rejects.toMatchObject({ code: "account_identity_mismatch" });
    const client = { getPremiumState: vi.fn(async () => entitlement()) };
    await expect(activatePremiumDevice(store.pool(), client, "new-phone", identity(), false)).rejects.toMatchObject({ code: "device_activation_confirmation_required" });
    expect(client.getPremiumState).not.toHaveBeenCalled(); expect(store.active).toBe("old-phone");
  });
});
