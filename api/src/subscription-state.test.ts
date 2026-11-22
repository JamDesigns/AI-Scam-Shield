import type pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { persistPremiumState, premiumSql, subscriptionEnvironment, testAdminEnabled } from "./subscription-state.js";
import type { PremiumEntitlementState } from "./revenuecat-sync.js";

afterEach(() => vi.unstubAllEnvs());

describe("verified subscription persistence", () => {
  it("requires verification, matching environment and an unexpired period in every effective-access query", () => {
    const sql = premiumSql("s", false);
    expect(sql).toContain("s.verified_at IS NOT NULL");
    expect(sql).toContain("s.environment = $2");
    expect(sql).toContain("s.expires_at > clock_timestamp()");
    expect(sql).toContain("s.source = 'revenuecat'");
    expect(sql).not.toContain("test_admin");
  });
  it("does not let an older observation restore access after a newer expiration", async () => {
    let stored = { isPremium: false, observedAtMs: 2000 };
    const query = vi.fn(async (_sql: string, values: unknown[]) => {
      const observedAtMs = Number(values[5]);
      if (observedAtMs <= stored.observedAtMs) return { rows: [], rowCount: 0 };
      stored = { isPremium: Boolean(values[1]), observedAtMs };
      return { rows: [{ device_id: values[0] }], rowCount: 1 };
    });
    const pool = { query } as unknown as Pick<pg.Pool, "query">;
    const state: PremiumEntitlementState = { isPremium: true, expiresAt: "2026-12-01T00:00:00Z", productId: "monthly", environment: "PRODUCTION", observedAtMs: 1000 };
    expect(await persistPremiumState(pool, "synthetic-owner", state)).toBe(false);
    expect(stored).toEqual({ isPremium: false, observedAtMs: 2000 });
    expect(query.mock.calls[0][0]).toContain("provider_observed_at_ms < $6");
    expect(await persistPremiumState(pool, "synthetic-owner", { ...state, observedAtMs: 3000 })).toBe(true);
  });
  it("defaults to production and permits admin simulation only with explicit sandbox opt-in outside production", () => {
    vi.stubEnv("REVENUECAT_ENVIRONMENT", undefined);
    vi.stubEnv("ALLOW_TEST_ADMIN", "true"); vi.stubEnv("NODE_ENV", "development");
    expect(subscriptionEnvironment()).toBe("PRODUCTION"); expect(testAdminEnabled()).toBe(false);
    vi.stubEnv("REVENUECAT_ENVIRONMENT", "SANDBOX");
    expect(testAdminEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(testAdminEnabled()).toBe(false);
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("ALLOW_TEST_ADMIN", "false");
    expect(testAdminEnabled()).toBe(false);
  });
  it("fences a legacy observation when the installation becomes linked during RevenueCat I/O", async () => {
    let binding: string | null = null;
    let granted = false;
    const query = vi.fn(async (sql: string, values: unknown[]) => {
      expect(sql).toContain("COALESCE(request_device.account_id, request_device.id) = $7");
      const principal = binding ?? values[0];
      if (principal !== values[6]) return { rows: [], rowCount: 0 };
      granted = Boolean(values[1]); return { rows: [{ device_id: values[0] }], rowCount: 1 };
    });
    const pool = { query } as unknown as Pick<pg.Pool, "query">;
    const identityAtRequest = "old-device-id";
    binding = "new-stable-owner";
    const state: PremiumEntitlementState = { isPremium: true, expiresAt: null, productId: "monthly", environment: "PRODUCTION", observedAtMs: 3000 };
    expect(await persistPremiumState(pool, identityAtRequest, state, identityAtRequest)).toBe(false);
    expect(granted).toBe(false);
    expect(await persistPremiumState(pool, identityAtRequest, state, "new-stable-owner")).toBe(true);
  });
});
