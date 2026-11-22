import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { registerAccountRoutes } from "./account-routes.js";
import { AccountIdentityError } from "./account-identity.js";
import { ScanPolicyError } from "./scan-policy.js";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), link: vi.fn(), activate: vi.fn(), account: vi.fn(),
}));
vi.mock("./premium-accounts.js", () => ({
  getDeviceAccount: mocks.account, linkVerifiedAccount: mocks.link, activatePremiumDevice: mocks.activate,
}));
vi.mock("./shared-rate-limit.js", () => ({ consumeSharedRateLimit: async () => ({ allowed: true }) }));
vi.mock("./subscription-state.js", () => ({ readSubscriptionStatus: async () => ({ isPremium: false }) }));

afterEach(() => vi.resetAllMocks());
async function server(enabled = true) {
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof ScanPolicyError ? error.statusCode : error instanceof ZodError ? 400 : 500;
    reply.code(status).send({ error: error instanceof ScanPolicyError ? error.code : "invalid_request" });
  });
  registerAccountRoutes(app, { pool: {} as never, verifier: enabled ? { verify: mocks.verify } : null,
    revenueCatClient: {} as never, requireDevice: () => "authenticated-installation" });
  return app;
}
describe("account HTTP identity boundary (installation authentication tested separately)", () => {
  it("refuses linking without a separately verified account token", async () => {
    const app = await server();
    try {
      const response = await app.inject({ method: "POST", url: "/accounts/link", payload: {} });
      expect(response.statusCode).toBe(401);
      expect(mocks.link).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it("does not accept a client-selected account owner", async () => {
    const app = await server();
    try {
      const response = await app.inject({ method: "POST", url: "/accounts/link",
        headers: { "x-account-authorization": "Bearer synthetic.token.value" }, payload: { accountId: "victim" } });
      expect(response.statusCode).toBe(400);
      expect(mocks.verify).not.toHaveBeenCalled();
      expect(mocks.link).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it("links only the verified principal to the authenticated installation", async () => {
    const identity = { issuer: "synthetic-issuer", subject: "verified-google-user", authenticatedAt: 1 };
    mocks.verify.mockResolvedValue(identity);
    mocks.account.mockResolvedValue({ id: "stable-owner", activeDeviceId: null });
    const app = await server();
    try {
      const response = await app.inject({ method: "POST", url: "/accounts/link",
        headers: { "x-account-authorization": "Bearer synthetic.token.value" }, payload: {} });
      expect(response.statusCode).toBe(200);
      expect(mocks.link).toHaveBeenCalledWith(expect.anything(), "authenticated-installation", identity);
      expect(response.json()).toMatchObject({ revenueCatAppUserId: "stable-owner", activeOnThisDevice: false });
    } finally { await app.close(); }
  });
  it("requires explicit confirmation before activation or verification side effects", async () => {
    const app = await server();
    try {
      const response = await app.inject({ method: "POST", url: "/accounts/activate", payload: { confirm: false } });
      expect(response.statusCode).toBe(400);
      expect(mocks.activate).not.toHaveBeenCalled();
      expect(mocks.verify).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it("requires recent account authentication for activation", async () => {
    mocks.verify.mockRejectedValue(new AccountIdentityError("account_reauthentication_required"));
    const app = await server();
    try {
      const response = await app.inject({ method: "POST", url: "/accounts/activate",
        headers: { "x-account-authorization": "Bearer synthetic.token.value" }, payload: { confirm: true } });
      expect(response.statusCode).toBe(401);
      expect(mocks.verify).toHaveBeenCalledWith("synthetic.token.value", true);
      expect(mocks.activate).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it("fails closed when no external identity provider has been configured", async () => {
    const app = await server(false);
    try {
      const response = await app.inject({ method: "POST", url: "/accounts/link",
        headers: { "x-account-authorization": "Bearer synthetic.token.value" }, payload: {} });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "account_identity_unavailable" });
      expect(mocks.link).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});
