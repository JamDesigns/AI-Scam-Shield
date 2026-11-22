import { afterEach, describe, expect, it, vi } from "vitest";
import { translateWithDeepL } from "./translate.js";

afterEach(() => vi.unstubAllGlobals());
const params = { text: "Synthetic input", authKey: "test-not-a-real-key", apiBase: "https://example.invalid", targetLang: "EN" };

describe("translation availability", () => {
  it("aborts the underlying request when its deadline expires", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      signal = options.signal;
      signal!.addEventListener("abort", () => reject(new Error("synthetic request aborted")), { once: true });
    })));
    await expect(translateWithDeepL({ ...params, timeoutMs: 5 })).rejects.toThrow("synthetic request aborted");
    expect(signal?.aborted).toBe(true);
  });
  it("does not expose an upstream error body in its error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, text: async () => "synthetic confidential body" })));
    await expect(translateWithDeepL(params)).rejects.toThrow("DeepL error: 503");
    await expect(translateWithDeepL(params)).rejects.not.toThrow("confidential");
  });
});
