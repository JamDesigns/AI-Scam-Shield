import type pg from "pg";
import { describe, expect, it } from "vitest";
import { completeScanOperation, failScanOperation, reserveScanOperation, type ScanReservation } from "./scan-operations.js";

// A transactional in-memory PostgreSQL double. The row lock really blocks concurrent clients;
// there is no real DB, migration, provider or user data in these tests.
class TransactionalStore {
  operations = new Map<string, Record<string, any>>();
  events = new Map<string, unknown>();
  scans = 0;
  aiScans = 0;
  premium = false;
  syncPending = false;
  rejectEvent = false;
  private tail = Promise.resolve();
  async connect() {
    let unlock: (() => void) | undefined;
    let snapshot: { operations: typeof this.operations; events: typeof this.events; scans: number; aiScans: number } | undefined;
    const release = () => { unlock?.(); unlock = undefined; };
    return {
      release,
      query: async (raw: string, values: any[] = []) => {
        const sql = raw.replace(/\s+/g, " ").trim();
        const rows = (items: any[] = []) => ({ rows: items, rowCount: items.length });
        if (sql === "BEGIN") return rows();
        if (sql === "COMMIT") { release(); return rows(); }
        if (sql === "ROLLBACK") {
          if (snapshot) { this.operations = snapshot.operations; this.events = snapshot.events; this.scans = snapshot.scans; this.aiScans = snapshot.aiScans; }
          release(); return rows();
        }
        if (sql.startsWith("SELECT a.id, a.active_device_id")) return rows();
        if (sql.startsWith("SELECT id, account_id FROM devices")) {
          const previous = this.tail;
          const held = new Promise<void>((resolve) => { unlock = resolve; });
          this.tail = previous.then(() => held);
          await previous;
          snapshot = structuredClone({ operations: this.operations, events: this.events, scans: this.scans, aiScans: this.aiScans });
          return rows([{ id: values[0] }]);
        }
        if (sql.startsWith("SELECT * FROM scan_operations")) return rows([...this.operations.values()].filter((o) => o.device_id === values[0] && o.idempotency_key === values[1]));
        if (sql.startsWith("UPDATE scan_operations SET status = 'failed'") && sql.includes("INTERVAL")) return rows();
        if (sql.startsWith("SELECT id FROM scan_operations")) return rows([...this.operations.values()].filter((o) => o.device_id === values[0] && o.status === "processing").slice(0, 1));
        if (sql.startsWith("WITH clock AS")) return rows([{ as_of: "2026-10-30T12:00:00Z", year_week: "2026-W44",
          today_start: "2026-10-29T23:00:00Z", week_start: "2026-10-25T23:00:00Z", month_start: "2026-09-30T22:00:00Z", year_start: "2025-12-31T23:00:00Z", reset_at: "2026-11-01T23:00:00Z" }]);
        if (sql.includes("FROM subscriptions s JOIN devices")) return rows([{ is_premium: this.premium, scans_count: this.scans, ai_scans_count: this.aiScans, sync_pending: this.syncPending }]);
        if (sql.startsWith("INSERT INTO scan_operations")) {
          const [id, device_id, idempotency_key, request_hash, input_type, year_week, time_zone, ai_used, is_premium, ordinal, lease_token] = values;
          this.operations.set(id, { id, device_id, idempotency_key, request_hash, input_type, year_week, time_zone, ai_used, is_premium, ordinal, lease_token, status: "processing" });
          return rows();
        }
        if (sql.startsWith("SELECT status, response_json")) return rows([...this.operations.values()].filter((o) => o.id === values[0] && o.device_id === values[1]));
        if (sql.startsWith("INSERT INTO scan_events")) {
          if (this.rejectEvent) throw new Error("synthetic event failure");
          if (this.events.has(values[0])) throw new Error("duplicate event");
          this.events.set(values[0], { kind: values[10], category: values[3], riskScore: values[5], createdAt: values[11] });
          return rows();
        }
        if (sql.startsWith("INSERT INTO device_weekly_usage")) { this.scans += 1; this.aiScans += values[2]; return rows(); }
        if (sql.startsWith("UPDATE scan_operations SET status = 'completed'")) {
          Object.assign(this.operations.get(values[0])!, { status: "completed", response_status: 200, response_json: JSON.parse(values[1]) });
          return rows();
        }
        if (sql.startsWith("UPDATE scan_operations SET status = 'failed'")) {
          const op = this.operations.get(values[0]);
          if (op?.device_id === values[1] && op.lease_token === values[2] && op.status === "processing") op.status = "failed";
          return rows();
        }
        if (sql.startsWith("UPDATE media_analysis_jobs")) return rows();
        throw new Error(`Unhandled database command in test double: ${sql}`);
      },
    };
  }
  pool() { return this as unknown as pg.Pool; }
}

const params = (key: string, kind: "text" | "image" | "video" = "text") => ({ deviceId: "synthetic-device", idempotencyKey: key, requestHash: `hash-${key}`, kind, timeZone: "Europe/Madrid", weeklyLimit: 3 });
const event = { inputPreview: "synthetic only", finalCategory: "high_risk", finalRiskScore: 80, threatType: "unknown_suspicious", classicCategory: "high_risk", classicRiskScore: 80, aiUsed: true, isThreat: true };
async function reserve(store: TransactionalStore, key: string, kind: "text" | "image" | "video" = "text"): Promise<ScanReservation> {
  const result = await reserveScanOperation(store.pool(), params(key, kind));
  if (result.replay) throw new Error("Unexpected replay");
  return result.operation;
}

describe("atomic operation lifecycle", () => {
  it("does not debit free usage while subscription verification is pending or retrying", async () => {
    const store = new TransactionalStore(); store.syncPending = true;
    await expect(reserve(store, "waiting-for-revenuecat")).rejects.toMatchObject({ code: "subscription_sync_pending", statusCode: 503 });
    expect(store.scans).toBe(0); expect(store.events.size).toBe(0); expect(store.operations.size).toBe(0);
    store.premium = true;
    expect((await reserve(store, "verified-premium-revenuecat-retrying")).aiUsed).toBe(true);
  });
  it("does not commit a result whose completion deadline has already elapsed", async () => {
    const store = new TransactionalStore();
    const operation = await reserve(store, "expired-global-deadline");
    await expect(completeScanOperation(store.pool(), operation, event, {}, 3, undefined, Date.now() - 1)).rejects.toMatchObject({ code: "operation_timeout" });
    expect(store.scans).toBe(0); expect(store.events.size).toBe(0);
  });
  it("permits only one first-AI reservation across concurrent API clients", async () => {
    const store = new TransactionalStore();
    const attempts = await Promise.allSettled([reserve(store, "key-one"), reserve(store, "key-two")]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.code).toBe("scan_in_progress");
    expect(store.scans).toBe(0);
    expect([...store.operations.values()].filter((o) => o.status === "processing")).toHaveLength(1);
  });
  it("charges one multimedia unit and one AI unit, then permits two classic texts", async () => {
    const store = new TransactionalStore();
    const image = await reserve(store, "first-image", "image");
    expect(image.aiUsed).toBe(true);
    await completeScanOperation(store.pool(), image, event, { result: "image" }, 3);
    expect(store.scans).toBe(1); expect(store.aiScans).toBe(1); expect(store.events.size).toBe(1);
    await expect(reserve(store, "second-video", "video")).rejects.toMatchObject({ code: "ai_quota_exceeded" });
    for (const key of ["second-text", "third-text"]) {
      const text = await reserve(store, key);
      expect(text.aiUsed).toBe(false);
      await completeScanOperation(store.pool(), text, event, { result: "classic" }, 3);
    }
    expect(store.scans).toBe(3); expect(store.aiScans).toBe(1); expect(store.events.size).toBe(3);
    await expect(reserve(store, "fourth-text")).rejects.toMatchObject({ code: "quota_exceeded" });
  });
  it("replays completion and prevents duplicate event/counter updates", async () => {
    const store = new TransactionalStore();
    const operation = await reserve(store, "retry-key");
    const result = await completeScanOperation(store.pool(), operation, event, { category: "high_risk" }, 3);
    expect(await completeScanOperation(store.pool(), operation, event, { category: "low_risk" }, 3)).toEqual(result);
    expect(await reserveScanOperation(store.pool(), params("retry-key"))).toEqual({ replay: true, statusCode: 200, response: result });
    expect(store.scans).toBe(1); expect(store.events.size).toBe(1);
    await expect(reserveScanOperation(store.pool(), { ...params("retry-key"), requestHash: "changed-content" })).rejects.toMatchObject({ code: "idempotency_conflict" });
  });
  it("does not spend a failed first analysis and rejects its obsolete worker lease", async () => {
    const store = new TransactionalStore();
    const failed = await reserve(store, "failure-key");
    await failScanOperation(store.pool(), failed);
    const retry = await reserve(store, "failure-key");
    expect(retry.aiUsed).toBe(true); expect(retry.leaseToken).not.toBe(failed.leaseToken);
    await expect(completeScanOperation(store.pool(), failed, event, {}, 3)).rejects.toMatchObject({ code: "operation_expired" });
    await failScanOperation(store.pool(), failed);
    await completeScanOperation(store.pool(), retry, event, {}, 3);
    expect(store.scans).toBe(1); expect(store.events.size).toBe(1);
  });
  it("rolls back an event failure without charging quota", async () => {
    const store = new TransactionalStore();
    const operation = await reserve(store, "db-failure-key");
    store.rejectEvent = true;
    await expect(completeScanOperation(store.pool(), operation, event, {}, 3)).rejects.toThrow("synthetic event failure");
    expect(store.scans).toBe(0); expect(store.events.size).toBe(0);
    expect(store.operations.get(operation.id)?.status).toBe("processing");
  });
  it("keeps premium AI unlimited while recording each successful analysis", async () => {
    const store = new TransactionalStore(); store.premium = true;
    for (let index = 0; index < 5; index++) {
      const operation = await reserve(store, `premium-${index}`, "video");
      expect(operation.aiUsed).toBe(true);
      await completeScanOperation(store.pool(), operation, event, {}, 3);
    }
    expect(store.scans).toBe(0); expect(store.events.size).toBe(5);
  });
});
