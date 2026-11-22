import { afterAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issue: vi.fn(), enqueue: vi.fn(async () => 1), rate: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 30 })),
}));
vi.mock("./db.js", async () => ({ ...await vi.importActual("./db.js"), createPool: () => ({ end: async () => {} }) }));
vi.mock("./migrations.js", () => ({ runMigrations: vi.fn(async () => undefined) }));
vi.mock("./device-sessions.js", () => ({ issueDeviceSession: mocks.issue,
  authenticateDeviceSession: vi.fn(async () => ({ deviceId: "55d00910-c8da-48f7-9dd4-99d4aeb8f6cb", timeZone: "UTC" })) }));
vi.mock("./shared-rate-limit.js", async () => ({ ...await vi.importActual("./shared-rate-limit.js"), consumeSharedRateLimit: mocks.rate }));
vi.mock("./revenuecat-jobs.js", async () => ({ ...await vi.importActual("./revenuecat-jobs.js"), enqueueSubscriptionSync: mocks.enqueue }));
vi.mock("./subscription-state.js", async () => ({ ...await vi.importActual("./subscription-state.js"), readSubscriptionStatus: vi.fn(async () => ({ isPremium: false, expiresAt: null, environment: "PRODUCTION", syncPending: false })) }));

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://not-used.invalid/synthetic-only";
process.env.REVENUECAT_API_KEY = "";
process.env.REVENUECAT_ENVIRONMENT = "PRODUCTION";
process.env.REVENUECAT_WEBHOOK_AUTH = "";
process.env.SESSION_RATE_LIMIT_SECRET = "";
const { app } = await import("./index.js");
afterAll(async () => { await app.close(); });

describe("missing subscription configuration", () => {
  it("does not create a pending job or invent premium when no API key exists", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const response = await app.inject({ method: "POST", url: "/subscriptions/sync", payload: {} });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("subscription_sync_unavailable");
    expect(mocks.enqueue).not.toHaveBeenCalled();
    const status = await app.inject({ method: "GET", url: "/subscriptions/status" });
    expect(status.json()).toMatchObject({ isPremium: false, syncAvailable: false, syncPending: false });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it("does not accept enrollment without its shared limiter secret", async () => {
    const response = await app.inject({ method: "POST", url: "/sessions", payload: { timeZone: "UTC" } });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("session_enrollment_unavailable");
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("does not treat an empty webhook password as authorization", async () => {
    const response = await app.inject({ method: "POST", url: "/webhooks/revenuecat", payload: {} });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("subscription_webhook_unavailable");
  });
});
