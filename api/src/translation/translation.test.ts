import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_LOCALES } from "../locales.js";
import { createTranslationProvider, DeepLTranslationProvider } from "./deepl-translation-provider.js";
import { TRANSLATION_TARGETS, translationTarget, verifyTranslationCoverage, type TranslationProvider } from "./translation-provider.js";
import { TranslationService } from "./translation-service.js";

afterEach(() => vi.unstubAllGlobals());
const config = { authKey: "synthetic-not-a-real-key", apiBase: "https://example.invalid" };
const response = (value: unknown) => ({ ok: true, json: async () => value });

describe("configured translation boundary", () => {
  it.each(SUPPORTED_LOCALES)("maps %s and regional variants to an explicit target", (locale) => {
    expect(translationTarget(locale)).toBe(TRANSLATION_TARGETS[locale]);
    if (locale !== "en-GB") expect(translationTarget(`${locale}-XX`)).toBe(TRANSLATION_TARGETS[locale]);
  });
  it("preserves British English and European Portuguese and rejects unknown languages", () => {
    expect(translationTarget("en-US")).toBe("EN-GB");
    expect(translationTarget("pt-BR")).toBe("PT-PT");
    expect(() => translationTarget("xx")).toThrow("translation_target_unsupported");
  });
  it("never enables external translation for the local profile or disabled provider", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(createTranslationProvider({ profile: "local", provider: "deepl", deepl: config })).toBeNull();
    expect(createTranslationProvider({ profile: "production", provider: "none" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps provider-native prose unchanged without external translation", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await new TranslationService(null).fields({ explanation: "", reason: "Local generated text" }, "mt"))
      .toEqual({ explanation: "", reason: "Local generated text" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("queries text target capability, not source-only language availability", async () => {
    const fetch = vi.fn(async () => response(SUPPORTED_LOCALES.map((locale) => ({ lang: TRANSLATION_TARGETS[locale], usable_as_target: locale !== "mt" }))));
    vi.stubGlobal("fetch", fetch);
    const report = await verifyTranslationCoverage(new DeepLTranslationProvider(config));
    expect(report).toMatchObject({ ready: false, checkedLocales: 25, missingLocales: ["mt"] });
    expect(String(fetch.mock.calls[0][0])).toContain("/v3/languages?resource=translate_text");
  });
  it("batches separate fields in a single request with exact cardinality", async () => {
    const fetch = vi.fn(async (_url, options) => {
      expect(options.redirect).toBe("error");
      expect(options.body.getAll("text")).toEqual(["first", "second"]);
      expect(options.body.get("target_lang")).toBe("GA");
      return response({ translations: [{ text: "a" }, { text: "b" }] });
    });
    vi.stubGlobal("fetch", fetch);
    expect(await new DeepLTranslationProvider(config).translate({ texts: ["first", "second"], targetLanguage: "GA" })).toEqual(["a", "b"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([{ translations: [{ text: "one" }] }, { translations: [{ text: "" }, { text: "two" }] }, null])("rejects malformed or incomplete response %j", async (value) => {
    vi.stubGlobal("fetch", vi.fn(async () => response(value)));
    await expect(new DeepLTranslationProvider(config).translate({ texts: ["one", "two"], targetLanguage: "CA" })).rejects.toThrow("translation_invalid_response");
  });
  it("does not leak upstream bodies or credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, text: async () => "private-upstream-body", status: 403 })));
    await expect(new DeepLTranslationProvider(config).translate({ texts: ["test"], targetLanguage: "ES" })).rejects.toThrow("translation_unavailable");
  });
  it("propagates caller abort and own deadline to the actual fetch", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      if (options.signal.aborted) return reject(new Error("aborted"));
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })));
    await expect(new DeepLTranslationProvider({ ...config, timeoutMs: 5 }).translate({ texts: ["test"], targetLanguage: "ES" })).rejects.toThrow("aborted");
    const controller = new AbortController(); controller.abort();
    await expect(new DeepLTranslationProvider(config).supportedTargets(controller.signal)).rejects.toThrow("aborted");
  });
  it("preserves object scores, evidence, reason codes, array boundaries, quoted extracts and URLs", async () => {
    const provider: TranslationProvider = { name: "test", supportedTargets: async () => new Set(["ES"]),
      translate: async ({ texts }) => texts.map((text) => `translated: ${text}`) };
    const original = { riskScore: 85, category: "high_risk" as const, threatType: "bank_phishing" as const,
      reasons: ["SUSPICIOUS_PATH", "This is a URL: https://example.invalid/a?q=1", 'Original says "Pay now"'],
      explanation: "A demand needs independent verification.", extractedText: "Original OCR" };
    const result = await new TranslationService(provider).analysis(original, "es");
    expect(result.riskScore).toBe(85);
    expect(result.category).toBe(original.category);
    expect(result.extractedText).toBe(original.extractedText);
    expect(result.reasons).toEqual(["SUSPICIOUS_PATH", "translated: This is a URL: https://example.invalid/a?q=1", 'translated: Original says "Pay now"']);
    expect(original.explanation).toBe("A demand needs independent verification.");
  });
  it("refuses a translation that loses protected evidence markers", async () => {
    const provider: TranslationProvider = { name: "test", supportedTargets: async () => new Set(["ES"]), translate: async () => ["marker was lost"] };
    await expect(new TranslationService(provider).fields({ explanation: "Visit https://example.invalid" }, "es")).rejects.toThrow("translation_invalid_response");
  });
});
