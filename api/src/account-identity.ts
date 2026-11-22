import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

export class AccountIdentityError extends Error {
  constructor(readonly code: "account_identity_unavailable" | "account_identity_invalid" | "account_reauthentication_required") {
    super(code);
  }
}
export type VerifiedAccountIdentity = { issuer: string; subject: string; authenticatedAt: number };
export interface AccountIdentityVerifier { verify(token: string, requireRecent?: boolean): Promise<VerifiedAccountIdentity> }

/** Verifies Firebase ID tokens, NOT Google OAuth access tokens. No private service-account key is needed. */
export class FirebaseAccountIdentityVerifier implements AccountIdentityVerifier {
  private keys = new Map<string, JsonWebKey>();
  private keysExpireAt = 0;
  private refresh: Promise<void> | null = null;
  private lastUnknownKeyRefresh = 0;
  constructor(private readonly projectId: string, private readonly fetcher: typeof fetch = fetch, private readonly now = Date.now) {
    if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId)) throw new AccountIdentityError("account_identity_unavailable");
  }
  private async loadKeys() {
    if (this.keysExpireAt > this.now()) return;
    if (!this.refresh) this.refresh = (async () => {
      const response = await this.fetcher("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com", { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new AccountIdentityError("account_identity_unavailable");
      const body = await response.json() as { keys?: Array<JsonWebKey & { kid?: string; alg?: string; use?: string }> };
      if (!Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > 50) throw new AccountIdentityError("account_identity_unavailable");
      const keys = new Map<string, JsonWebKey>();
      for (const key of body.keys) if (key.kid && key.kty === "RSA" && (!key.alg || key.alg === "RS256") && (!key.use || key.use === "sig")) keys.set(key.kid, key);
      if (!keys.size) throw new AccountIdentityError("account_identity_unavailable");
      this.keys = keys;
      const maxAge = Number(/(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get("cache-control") ?? "")?.[1] ?? 300);
      this.keysExpireAt = this.now() + Math.max(1, Math.min(maxAge, 3600)) * 1000;
    })().finally(() => { this.refresh = null; });
    try { await this.refresh; } catch { throw new AccountIdentityError("account_identity_unavailable"); }
  }
  async verify(token: string, requireRecent = false): Promise<VerifiedAccountIdentity> {
    if (typeof token !== "string" || token.length > 16384) throw new AccountIdentityError("account_identity_invalid");
    const segments = token.split(".");
    if (segments.length !== 3 || segments.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new AccountIdentityError("account_identity_invalid");
    let header: { alg?: string; kid?: string }, claims: Record<string, unknown>;
    try { header = JSON.parse(Buffer.from(segments[0], "base64url").toString()); claims = JSON.parse(Buffer.from(segments[1], "base64url").toString()); }
    catch { throw new AccountIdentityError("account_identity_invalid"); }
    if (!header || typeof header !== "object" || !claims || typeof claims !== "object" || Array.isArray(claims) || header.alg !== "RS256" || typeof header.kid !== "string") throw new AccountIdentityError("account_identity_invalid");
    await this.loadKeys();
    let key = this.keys.get(header.kid);
    if (!key && this.now() - this.lastUnknownKeyRefresh >= 60000) {
      // Refresh for rotation, but an attacker-controlled unknown kid cannot cause a fetch storm.
      this.lastUnknownKeyRefresh = this.now();
      this.keysExpireAt = 0;
      await this.loadKeys();
      key = this.keys.get(header.kid);
    }
    if (!key) throw new AccountIdentityError("account_identity_invalid");
    try {
      if (!verify("RSA-SHA256", Buffer.from(`${segments[0]}.${segments[1]}`), createPublicKey({ key, format: "jwk" }), Buffer.from(segments[2], "base64url"))) throw new Error();
    } catch { throw new AccountIdentityError("account_identity_invalid"); }
    const now = Math.floor(this.now() / 1000), issuer = `https://securetoken.google.com/${this.projectId}`;
    const firebase = claims.firebase as { sign_in_provider?: unknown } | undefined;
    if (claims.iss !== issuer || claims.aud !== this.projectId || typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128 ||
      typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= now || typeof claims.iat !== "number" || !Number.isFinite(claims.iat) || claims.iat > now + 30 ||
      typeof claims.auth_time !== "number" || !Number.isFinite(claims.auth_time) || claims.auth_time > now + 30 || claims.auth_time <= 0 || firebase?.sign_in_provider !== "google.com") {
      throw new AccountIdentityError("account_identity_invalid");
    }
    if (requireRecent && now - claims.auth_time > 300) throw new AccountIdentityError("account_reauthentication_required");
    return { issuer, subject: claims.sub, authenticatedAt: claims.auth_time };
  }
}

export function createAccountIdentityVerifier(config: { provider?: string; firebaseProjectId?: string }): AccountIdentityVerifier | null {
  const provider = config.provider?.trim() || "disabled";
  if (provider === "disabled") return null;
  if (provider !== "firebase" || !config.firebaseProjectId) throw new AccountIdentityError("account_identity_unavailable");
  return new FirebaseAccountIdentityVerifier(config.firebaseProjectId);
}
