import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashDeviceAccessToken } from "./device-sessions.js";

const mocks = vi.hoisted(() => {
  const devices = new Map<string, { tokenHash: string; timeZone: string }>();
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("INSERT INTO devices (id, auth_token_hash")) {
      devices.set(String(values[0]), { tokenHash: String(values[1]), timeZone: String(values[2]) });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("WHERE id = $1 AND auth_token_hash = $2")) {
      const device = devices.get(String(values[0]));
      return { rows: device?.tokenHash === values[1] ? [{ id: values[0], time_zone: device.timeZone }] : [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  return { devices, query, pool: { query, connect: vi.fn(async () => client), end: vi.fn(async () => undefined) },
    consumeRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 30 })),
    enqueueSync: vi.fn(async () => 1), recordEvent: vi.fn(async () => ({ duplicate: false, queued: 1, ignored: false })),
    status: vi.fn(async () => ({ isPremium: false, expiresAt: null, environment: "SANDBOX", syncedAt: null, syncPending: false })),
  };
});

vi.mock("./db.js", async () => ({ ...await vi.importActual("./db.js"), createPool: () => mocks.pool }));
vi.mock("./migrations.js", () => ({ runMigrations: vi.fn(async () => undefined) }));
vi.mock("./shared-rate-limit.js", async () => ({ ...await vi.importActual("./shared-rate-limit.js"), consumeSharedRateLimit: mocks.consumeRateLimit }));
vi.mock("./revenuecat-jobs.js", async () => ({ ...await vi.importActual("./revenuecat-jobs.js"), enqueueSubscriptionSync: mocks.enqueueSync, recordRevenueCatEvent: mocks.recordEvent }));
vi.mock("./subscription-state.js", async () => ({ ...await vi.importActual("./subscription-state.js"), readSubscriptionStatus: mocks.status }));

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://synthetic-only@127.0.0.1/not-used";
process.env.ADMIN_TOKEN = "test-admin-not-production";
process.env.REVENUECAT_WEBHOOK_AUTH = "test-webhook-not-production";
process.env.REVENUECAT_API_KEY = "test-only-not-a-provider-key";
process.env.REVENUECAT_ENVIRONMENT = "SANDBOX";
process.env.SESSION_RATE_LIMIT_SECRET = "synthetic-shared-rate-secret-only-for-tests";
process.env.ALLOW_TEST_ADMIN = "false";

const { app } = await import("./index.js");
const owner = "48b77e85-0aba-45ef-9c97-12500f070500";
const other = "784f4577-c38b-4dd8-b671-c33c4721bbda";
const token = "a".repeat(64);
const headers = { "x-device-id": owner, authorization: `Bearer ${token}` };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = "test";
  process.env.ALLOW_TEST_ADMIN = "false";
  mocks.devices.clear();
  mocks.devices.set(owner, { tokenHash: hashDeviceAccessToken(token), timeZone: "Europe/Madrid" });
  mocks.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 30 });
});
afterAll(async () => { await app.close(); });

describe("authenticated API boundary", () => {
  it("issues a fresh identity, stores a hash and returns credentials only once", async () => {
    const response = await app.inject({ method: "POST", url: "/sessions", payload: { timeZone: "Europe/Madrid" } });
    expect(response.statusCode).toBe(201);
    const session = response.json();
    expect(session.deviceId).toMatch(/^[a-f0-9-]{36}$/);
    expect(session.deviceId).not.toBe(owner);
    expect(session.accessToken).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.devices.get(session.deviceId)).toEqual({ tokenHash: hashDeviceAccessToken(session.accessToken), timeZone: "Europe/Madrid" });
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain(session.accessToken);
  });
  it("does not accept a legacy identifier as an enrollment claim", async () => {
    const response = await app.inject({ method: "POST", url: "/sessions", payload: { timeZone: "UTC", deviceId: owner } });
    expect(response.statusCode).toBe(400);
    expect(mocks.devices.size).toBe(1);
  });
  it("rejects identifier-only access without creating or reading a device", async () => {
    const response = await app.inject({ method: "GET", url: "/activity", headers: { "x-device-id": owner } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("session_invalid");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("cannot use a valid token to access another identifier", async () => {
    const response = await app.inject({ method: "GET", url: "/activity", headers: { ...headers, "x-device-id": other } });
    expect(response.statusCode).toBe(401);
    expect(mocks.query.mock.calls.every(([sql]) => !sql.includes("scan_events"))).toBe(true);
  });
  it("uses the registered zone if the header is absent and refuses a quota-zone change", async () => {
    expect((await app.inject({ method: "GET", url: "/subscriptions/status", headers })).statusCode).toBe(200);
    const response = await app.inject({ method: "GET", url: "/subscriptions/status", headers: { ...headers, "x-time-zone": "Pacific/Honolulu" } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "time_zone_mismatch", timeZone: "Europe/Madrid" });
  });
  it("enforces enrollment rate limits and ignores forged forwarding headers", async () => {
    mocks.consumeRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 123 });
    const response = await app.inject({ method: "POST", url: "/sessions", headers: { "x-forwarded-for": "203.0.113.20" }, payload: { timeZone: "UTC" } });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "enrollment_rate_limited", retryAfterSeconds: 123 });
    expect(mocks.query).not.toHaveBeenCalled();
    const { enrollmentSubject } = await import("./shared-rate-limit.js");
    expect(mocks.consumeRateLimit.mock.calls[0][1].subjectHash).toBe(enrollmentSubject("127.0.0.1", process.env.SESSION_RATE_LIMIT_SECRET!));
  });
  it("returns a durable sync acknowledgement without provider I/O in the request", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const response = await app.inject({ method: "POST", url: "/subscriptions/sync", headers, payload: {} });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: "queued", retryAfterSeconds: 3 });
    expect(mocks.enqueueSync).toHaveBeenCalledWith(mocks.pool, [owner]);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it("accepts a transfer without app_user_id and wires both owners to reconciliation", async () => {
    const response = await app.inject({ method: "POST", url: "/webhooks/revenuecat", headers: { authorization: process.env.REVENUECAT_WEBHOOK_AUTH! },
      payload: { event: { id: "synthetic-transfer", type: "TRANSFER", transferred_from: [owner], transferred_to: [other] } } });
    expect(response.statusCode).toBe(200);
    expect(mocks.recordEvent).toHaveBeenCalledWith(mocks.pool, expect.objectContaining({ eventId: "synthetic-transfer", affectedUserIds: [owner, other] }), "SANDBOX");
  });
  it("authenticates the webhook independently and requires an event id", async () => {
    expect((await app.inject({ method: "POST", url: "/webhooks/revenuecat", payload: {} })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/webhooks/revenuecat", headers: { authorization: process.env.REVENUECAT_WEBHOOK_AUTH! }, payload: { event: { type: "RENEWAL", app_user_id: owner } } })).statusCode).toBe(400);
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });
  it("keeps the admin toggle disabled by default and in production", async () => {
    expect((await app.inject({ method: "POST", url: "/admin/subscriptions/set", headers: { "x-admin-token": process.env.ADMIN_TOKEN! }, payload: { deviceId: owner, isPremium: true } })).statusCode).toBe(404);
    process.env.ALLOW_TEST_ADMIN = "true"; process.env.NODE_ENV = "production";
    expect((await app.inject({ method: "POST", url: "/admin/subscriptions/set", headers: { "x-admin-token": process.env.ADMIN_TOKEN! }, payload: { deviceId: owner, isPremium: true } })).statusCode).toBe(404);
  });
});
