import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FirebaseAccountIdentityVerifier, createAccountIdentityVerifier } from "./account-identity.js";

const project = "synthetic-shield-project";
const now = 1_800_000_000_000;
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
function token(overrides: Record<string, unknown> = {}, header = { alg: "RS256", kid: "synthetic-key" }) {
  const body = `${b64(header)}.${b64({ iss: `https://securetoken.google.com/${project}`, aud: project, sub: "synthetic-google-user", iat: now / 1000 - 10, exp: now / 1000 + 3600, auth_time: now / 1000 - 10, firebase: { sign_in_provider: "google.com" }, ...overrides })}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), pair.privateKey).toString("base64url")}`;
}
function verifier() {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ keys: [{ ...pair.publicKey.export({ format: "jwk" }), kid: "synthetic-key", alg: "RS256", use: "sig" }] }), { headers: { "cache-control": "max-age=3600" } }));
  return { instance: new FirebaseAccountIdentityVerifier(project, fetcher as typeof fetch, () => now), fetcher };
}

describe("verified Google account identity", () => {
  it("accepts a real RSA-signed Firebase Google ID token and caches public keys", async () => {
    const { instance, fetcher } = verifier();
    expect(await instance.verify(token(), true)).toEqual({ issuer: `https://securetoken.google.com/${project}`, subject: "synthetic-google-user", authenticatedAt: now / 1000 - 10 });
    await instance.verify(token());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([{ aud: "wrong-project" }, { iss: "https://attacker.invalid" }, { exp: now / 1000 }, { sub: "" }, { firebase: { sign_in_provider: "password" } }, { auth_time: now / 1000 + 1000 }])("rejects invalid signed claims %j", async (claims) => {
    await expect(verifier().instance.verify(token(claims))).rejects.toMatchObject({ code: "account_identity_invalid" });
  });
  it("rejects forged signatures and algorithm confusion", async () => {
    const forged = token().split("."); forged[1] = b64({ sub: "attacker" });
    await expect(verifier().instance.verify(forged.join("."))).rejects.toMatchObject({ code: "account_identity_invalid" });
    await expect(verifier().instance.verify(token({}, { alg: "HS256", kid: "synthetic-key" }))).rejects.toMatchObject({ code: "account_identity_invalid" });
  });
  it("requires actual recent authentication for a terminal switch, not just a refreshed token", async () => {
    const idToken = token({ auth_time: now / 1000 - 301 });
    await expect(verifier().instance.verify(idToken)).resolves.toBeDefined();
    await expect(verifier().instance.verify(idToken, true)).rejects.toMatchObject({ code: "account_reauthentication_required" });
  });
  it("fails closed without identity configuration or with a failed key service", async () => {
    expect(createAccountIdentityVerifier({})).toBeNull();
    expect(() => createAccountIdentityVerifier({ provider: "anything" })).toThrow("account_identity_unavailable");
    const instance = new FirebaseAccountIdentityVerifier(project, vi.fn(async () => { throw new Error("secret upstream diagnostic"); }) as typeof fetch, () => now);
    await expect(instance.verify(token())).rejects.toThrow("account_identity_unavailable");
  });
  it("refreshes rotated keys once and bounds unknown-key refreshes", async () => {
    let count = 0;
    const fetcher = vi.fn(async () => {
      count++;
      return new Response(JSON.stringify({ keys: [{ ...pair.publicKey.export({ format: "jwk" }), kid: count === 1 ? "synthetic-key" : "rotated-key" }] }));
    });
    const instance = new FirebaseAccountIdentityVerifier(project, fetcher as typeof fetch, () => now);
    await instance.verify(token());
    await expect(instance.verify(token({}, { alg: "RS256", kid: "rotated-key" }))).resolves.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 3; i++) await expect(instance.verify(token({}, { alg: "RS256", kid: `unknown-${i}` }))).rejects.toMatchObject({ code: "account_identity_invalid" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
