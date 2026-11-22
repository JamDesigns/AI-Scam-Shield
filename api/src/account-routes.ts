import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { AccountIdentityError, type AccountIdentityVerifier } from "./account-identity.js";
import { activatePremiumDevice, getDeviceAccount, linkVerifiedAccount } from "./premium-accounts.js";
import { readSubscriptionStatus } from "./subscription-state.js";
import type { RevenueCatClient } from "./revenuecat-sync.js";
import { consumeSharedRateLimit } from "./shared-rate-limit.js";
import { ScanPolicyError } from "./scan-policy.js";

/** These routes also require the ordinary authenticated installation session in onRequest. */
export function registerAccountRoutes(app: FastifyInstance, options: {
  pool: pg.Pool; verifier: AccountIdentityVerifier | null;
  revenueCatClient: Pick<RevenueCatClient, "getPremiumState">;
  requireDevice: (request: FastifyRequest) => string;
}) {
  const identity = async (request: FastifyRequest, recent = false) => {
    if (!options.verifier) throw new ScanPolicyError("account_identity_unavailable", 503);
    const header = request.headers["x-account-authorization"];
    const token = typeof header === "string" && /^Bearer ([A-Za-z0-9_.-]+)$/.exec(header)?.[1];
    if (!token) throw new ScanPolicyError("account_identity_invalid", 401);
    try { return await options.verifier.verify(token, recent); }
    catch (error) {
      const code = error instanceof AccountIdentityError ? error.code : "account_identity_unavailable";
      throw new ScanPolicyError(code, code === "account_identity_unavailable" ? 503 : 401);
    }
  };
  const limited = async (scope: string, subject: string, limit: number) => {
    const result = await consumeSharedRateLimit(options.pool, { scope, subjectHash: createHash("sha256").update(subject).digest("hex"), limit, windowSeconds: 3600 });
    if (!result.allowed) throw new ScanPolicyError("account_rate_limited", 429, { retryAfterSeconds: result.retryAfterSeconds });
  };
  const status = async (deviceId: string) => {
    const account = await getDeviceAccount(options.pool, deviceId);
    const subscription = await readSubscriptionStatus(options.pool, deviceId);
    return { linked: account !== null, accountId: account?.id ?? null,
      revenueCatAppUserId: account?.id ?? null, activeOnThisDevice: account?.activeDeviceId === deviceId,
      activationRequired: Boolean(account && account.activeDeviceId !== deviceId), ...subscription };
  };
  app.get("/accounts/status", async (request) => status(options.requireDevice(request)));
  app.post("/accounts/link", async (request) => {
    const deviceId = options.requireDevice(request);
    z.object({}).strict().parse(request.body ?? {});
    await limited("account_link", deviceId, 12);
    await linkVerifiedAccount(options.pool, deviceId, await identity(request));
    return status(deviceId);
  });
  app.post("/accounts/activate", async (request) => {
    const deviceId = options.requireDevice(request);
    const body = z.object({ confirm: z.literal(true) }).strict().parse(request.body);
    const verified = await identity(request, true);
    await limited("account_activate_device", deviceId, 12);
    await limited("account_activate_owner", `${verified.issuer}\0${verified.subject}`, 12);
    try { await activatePremiumDevice(options.pool, options.revenueCatClient, deviceId, verified, body.confirm); }
    catch (error) { if (error instanceof ScanPolicyError) throw error; throw new ScanPolicyError("subscription_sync_pending", 503); }
    return status(deviceId);
  });
}
