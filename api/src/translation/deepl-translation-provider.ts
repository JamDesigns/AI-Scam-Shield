import { TranslationError, type TranslationProvider, type TranslationRequest } from "./translation-provider.js";

export type DeepLTranslationConfig = {
  authKey: string;
  apiBase?: string;
  timeoutMs?: number;
  modelType?: "latency_optimized" | "quality_optimized";
};

/** Credentials are only sent to the configured HTTPS origin; redirects are refused. */
export class DeepLTranslationProvider implements TranslationProvider {
  readonly name = "deepl";
  private readonly base: URL;
  private readonly timeoutMs: number;
  constructor(private readonly config: DeepLTranslationConfig) {
    this.base = new URL(config.apiBase ?? "https://api.deepl.com");
    this.timeoutMs = config.timeoutMs ?? 15000;
    if (this.base.protocol !== "https:" || this.base.username || this.base.password ||
        !config.authKey.trim() || !Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 90000) {
      throw new TranslationError("translation_configuration_invalid");
    }
  }

  private async request(path: string, signal?: AbortSignal, body?: URLSearchParams): Promise<unknown> {
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const response = await fetch(new URL(path, this.base), {
      method: body ? "POST" : "GET",
      redirect: "error",
      headers: { Authorization: `DeepL-Auth-Key ${this.config.authKey}`, accept: "application/json",
        ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
      body,
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
    if (!response.ok) throw new TranslationError("translation_unavailable");
    try { return await response.json(); }
    catch { throw new TranslationError("translation_invalid_response"); }
  }

  async supportedTargets(signal?: AbortSignal): Promise<ReadonlySet<string>> {
    const value = await this.request("/v3/languages?resource=translate_text", signal);
    if (!Array.isArray(value) || value.some((entry) => !entry || typeof entry.lang !== "string" || typeof entry.usable_as_target !== "boolean")) {
      throw new TranslationError("translation_invalid_response");
    }
    return new Set(value.filter((entry) => entry.usable_as_target).map((entry) => entry.lang.toUpperCase()));
  }

  async translate(request: TranslationRequest): Promise<string[]> {
    if (request.texts.length === 0) return [];
    // DeepL accepts at most 50 text items per call and a 128 KiB request body.
    if (request.texts.length > 50 || request.texts.some((text) => typeof text !== "string" || !text.trim())) {
      throw new TranslationError("translation_configuration_invalid");
    }
    const body = new URLSearchParams();
    request.texts.forEach((text) => body.append("text", text));
    body.set("target_lang", request.targetLanguage);
    body.set("model_type", this.config.modelType ?? "quality_optimized");
    if (Buffer.byteLength(body.toString()) > 128 * 1024) throw new TranslationError("translation_configuration_invalid");
    const value = await this.request("/v2/translate", request.signal, body) as { translations?: unknown };
    if (!value || !Array.isArray(value.translations) || value.translations.length !== request.texts.length ||
        value.translations.some((entry) => !entry || typeof entry.text !== "string" || !entry.text.trim())) {
      throw new TranslationError("translation_invalid_response");
    }
    return value.translations.map((entry) => entry.text as string);
  }
}

export function createTranslationProvider(config: {
  profile: "local" | "production";
  provider?: "none" | "deepl";
  deepl?: DeepLTranslationConfig;
}): TranslationProvider | null {
  // Local generation/MADLAD remains owned by local-analysis.ts, never a paid fallback.
  if (config.profile === "local" || config.provider === "none") return null;
  if (!config.provider) return null;
  if (config.provider !== "deepl" || !config.deepl) throw new TranslationError("translation_configuration_invalid");
  return new DeepLTranslationProvider(config.deepl);
}
