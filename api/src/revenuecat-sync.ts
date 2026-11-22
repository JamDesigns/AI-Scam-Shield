import { z } from "zod";

export const DEFAULT_PREMIUM_ENTITLEMENT = "scam_shield_pro";
export type RevenueCatEnvironment = "PRODUCTION" | "SANDBOX";

const customerId = z.string().min(1).max(256).refine(
  (value) => value !== "." && value !== ".." && !/[\u0000-\u001f]/.test(value),
);
const isoDate = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const entitlementSchema = z.object({
  product_identifier: z.string().min(1),
  expires_date: isoDate.nullable(),
  grace_period_expires_date: isoDate.nullable().optional(),
});
const transactionSchema = z.object({
  is_sandbox: z.boolean(),
  refunded_at: isoDate.nullable().optional(),
});
const customerInfoSchema = z.object({
  request_date_ms: z.number().int().nonnegative(),
  subscriber: z.object({
    entitlements: z.record(z.string(), z.unknown()),
    subscriptions: z.record(z.string(), z.unknown()).default({}),
    non_subscriptions: z.record(z.string(), z.array(z.unknown())).default({}),
  }),
});

export type PremiumEntitlementState = {
  isPremium: boolean;
  expiresAt: string | null;
  productId: string | null;
  environment: RevenueCatEnvironment;
  observedAtMs: number;
};

export class RevenueCatSyncError extends Error {
  constructor(readonly reason: "not_configured" | "timeout" | "network" | "http_error" | "invalid_response") {
    super(`RevenueCat synchronization unavailable (${reason})`);
    this.name = "RevenueCatSyncError";
  }
}

/** Use the provider's current entitlement, never an event type alone. */
export function readPremiumEntitlement(
  input: unknown,
  options: {
    environment: RevenueCatEnvironment;
    entitlementId?: string;
    now?: Date;
  },
): PremiumEntitlementState {
  try {
    const data = customerInfoSchema.parse(input);
    const now = (options.now ?? new Date()).getTime();
    if (!Number.isFinite(now)) throw new Error("Invalid clock");
    const base: PremiumEntitlementState = {
      isPremium: false,
      expiresAt: null,
      productId: null,
      environment: options.environment,
      observedAtMs: data.request_date_ms,
    };
    const raw = data.subscriber.entitlements[options.entitlementId ?? DEFAULT_PREMIUM_ENTITLEMENT];
    if (raw === undefined) return base;
    const entitlement = entitlementSchema.parse(raw);
    const expiresMs = entitlement.expires_date === null
      ? null
      : Math.max(
          Date.parse(entitlement.expires_date),
          entitlement.grace_period_expires_date
            ? Date.parse(entitlement.grace_period_expires_date)
            : 0,
        );
    const state = {
      ...base,
      productId: entitlement.product_identifier,
      expiresAt: expiresMs === null ? null : new Date(expiresMs).toISOString(),
    };
    if (expiresMs !== null && expiresMs <= now) return state;

    const subscription = data.subscriber.subscriptions[entitlement.product_identifier];
    const purchases = subscription === undefined
      ? data.subscriber.non_subscriptions[entitlement.product_identifier] ?? []
      : [subscription];
    // Missing transaction/environment evidence is not a lifetime entitlement.
    if (purchases.length === 0) throw new Error("Missing entitlement transaction");
    const matching = purchases.map((value) => transactionSchema.parse(value)).some(
      (purchase) => purchase.is_sandbox === (options.environment === "SANDBOX") && !purchase.refunded_at,
    );
    return { ...state, isPremium: matching };
  } catch (error) {
    if (error instanceof RevenueCatSyncError) throw error;
    throw new RevenueCatSyncError("invalid_response");
  }
}

export type RevenueCatWebhook = {
  eventId: string;
  type: string;
  environment: RevenueCatEnvironment | null;
  affectedUserIds: string[];
};

/** Transfers may have no app_user_id; refresh both old and new owners. */
export function readRevenueCatWebhook(input: unknown): RevenueCatWebhook {
  const body = z.object({
    event: z.object({
      id: z.string().min(1).max(256),
      type: z.string().min(1).max(80),
      environment: z.enum(["PRODUCTION", "SANDBOX"]).optional(),
      app_user_id: customerId.optional(),
      aliases: z.array(customerId).max(100).optional(),
      transferred_from: z.array(customerId).max(100).optional(),
      transferred_to: z.array(customerId).max(100).optional(),
    }),
  }).parse(input);
  const affectedUserIds = [...new Set([
    ...(body.event.app_user_id ? [body.event.app_user_id] : []),
    ...(body.event.aliases ?? []),
    ...(body.event.transferred_from ?? []),
    ...(body.event.transferred_to ?? []),
  ])];
  if (body.event.type !== "TEST" && affectedUserIds.length === 0) {
    throw new Error("RevenueCat event has no customer identifiers");
  }
  return {
    eventId: body.event.id,
    type: body.event.type,
    environment: body.event.environment ?? null,
    affectedUserIds,
  };
}

export class RevenueCatClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: {
    apiKey: string;
    environment: RevenueCatEnvironment;
    entitlementId?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    now?: () => Date;
  }) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60000) {
      throw new RangeError("Invalid RevenueCat timeout");
    }
  }

  async getPremiumState(appUserId: string): Promise<PremiumEntitlementState> {
    if (!this.options.apiKey.trim()) throw new RevenueCatSyncError("not_configured");
    customerId.parse(appUserId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
        { headers: { Authorization: `Bearer ${this.options.apiKey}`, Accept: "application/json" }, signal: controller.signal },
      );
      if (!response.ok) throw new RevenueCatSyncError("http_error");
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new RevenueCatSyncError(controller.signal.aborted ? "timeout" : "invalid_response");
      }
      return readPremiumEntitlement(body, {
        environment: this.options.environment,
        entitlementId: this.options.entitlementId,
        now: this.options.now?.(),
      });
    } catch (error) {
      if (error instanceof RevenueCatSyncError) throw error;
      throw new RevenueCatSyncError(controller.signal.aborted ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
    }
  }
}
