import { afterEach, describe, expect, it, vi } from "vitest";
import { readPremiumEntitlement, readRevenueCatWebhook, RevenueCatClient } from "./revenuecat-sync.js";

const now = new Date("2026-10-30T12:00:00Z");
const later = "2026-11-30T12:00:00Z";
const earlier = "2026-10-29T12:00:00Z";
function info(entitlement: unknown = { product_identifier: "monthly", expires_date: later }, transaction: unknown = { is_sandbox: false, refunded_at: null }) {
  return {
    request_date_ms: now.getTime(),
    subscriber: {
      entitlements: { scam_shield_pro: entitlement },
      subscriptions: { monthly: transaction },
      non_subscriptions: {},
    },
  };
}

describe("RevenueCat reconciliation", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps access until the paid period ends, including cancellation of auto-renewal", () => {
    expect(readPremiumEntitlement(info(undefined, { is_sandbox: false, unsubscribe_detected_at: earlier }), {
      environment: "PRODUCTION", now,
    }).isPremium).toBe(true);
  });

  it("does not grant an expired entitlement", () => {
    expect(readPremiumEntitlement(info({ product_identifier: "monthly", expires_date: earlier }), {
      environment: "PRODUCTION", now,
    }).isPremium).toBe(false);
  });

  it("honors a documented grace period", () => {
    const result = readPremiumEntitlement(info({ product_identifier: "monthly", expires_date: earlier, grace_period_expires_date: later }), {
      environment: "PRODUCTION", now,
    });
    expect(result.isPremium).toBe(true);
    expect(result.expiresAt).toBe(later.replace("Z", ".000Z"));
  });

  it("does not let a sandbox purchase grant production access", () => {
    expect(readPremiumEntitlement(info(undefined, { is_sandbox: true }), {
      environment: "PRODUCTION", now,
    }).isPremium).toBe(false);
    expect(readPremiumEntitlement(info(undefined, { is_sandbox: true }), {
      environment: "SANDBOX", now,
    }).isPremium).toBe(true);
  });

  it("does not treat an unknown entitlement or a refund as premium", () => {
    expect(readPremiumEntitlement({ request_date_ms: now.getTime(), subscriber: { entitlements: {} } }, {
      environment: "PRODUCTION", now,
    }).isPremium).toBe(false);
    expect(readPremiumEntitlement(info(undefined, { is_sandbox: false, refunded_at: earlier }), {
      environment: "PRODUCTION", now,
    }).isPremium).toBe(false);
  });

  it("does not turn malformed customer info into a successful subscription sync", () => {
    expect(() => readPremiumEntitlement({}, { environment: "PRODUCTION", now })).toThrow("invalid_response");
    expect(() => readPremiumEntitlement(info({}, {}), { environment: "PRODUCTION", now })).toThrow("invalid_response");
    expect(() => readPremiumEntitlement(info(undefined, {}), { environment: "PRODUCTION", now })).toThrow("invalid_response");
  });

  it("requires transaction evidence for lifetime access", () => {
    const lifetime = {
      request_date_ms: now.getTime(),
      subscriber: {
        entitlements: { scam_shield_pro: { product_identifier: "lifetime", expires_date: null } },
        non_subscriptions: { lifetime: [{ is_sandbox: false }] },
      },
    };
    expect(readPremiumEntitlement(lifetime, { environment: "PRODUCTION", now }).isPremium).toBe(true);
    lifetime.subscriber.non_subscriptions.lifetime = [];
    expect(() => readPremiumEntitlement(lifetime, { environment: "PRODUCTION", now })).toThrow("invalid_response");
  });

  it("collects transfer owners even without app_user_id and removes duplicate aliases", () => {
    expect(readRevenueCatWebhook({ event: {
      id: "transfer-1", type: "TRANSFER", transferred_from: ["old-id"], transferred_to: ["new-id", "new-id"],
    } }).affectedUserIds).toEqual(["old-id", "new-id"]);
  });

  it("requires an event identifier for deduplication", () => {
    expect(() => readRevenueCatWebhook({ event: { type: "RENEWAL", app_user_id: "test" } })).toThrow();
  });

  it("retrieves current provider state instead of trusting an event's activate/deactivate flag", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(info()), { status: 200 }));
    const client = new RevenueCatClient({ apiKey: "test-only-key", environment: "PRODUCTION", now: () => now, fetchImpl });
    const result = await client.getPremiumState("customer/id");
    expect(result.isPremium).toBe(true);
    expect(result.observedAtMs).toBe(now.getTime());
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.revenuecat.com/v1/subscribers/customer%2Fid");
  });

  it("does not expose authentication or provider response bodies in an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("private body", { status: 401 }));
    const client = new RevenueCatClient({ apiKey: "test-only-secret", environment: "PRODUCTION", fetchImpl });
    await expect(client.getPremiumState("test-customer")).rejects.toThrow("http_error");
    try { await client.getPremiumState("test-customer"); } catch (error) {
      expect(String(error)).not.toContain("test-only-secret");
      expect(String(error)).not.toContain("private body");
    }
  });

  it("aborts a stalled provider request", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url: unknown, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const client = new RevenueCatClient({ apiKey: "test-key", environment: "PRODUCTION", timeoutMs: 100, fetchImpl: fetchImpl as typeof fetch });
    const request = expect(client.getPremiumState("test")).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(101);
    await request;
  });
});
