import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiAiProvider } from "./gemini-ai-provider.js";

const config = { baseUrl: "https://generativelanguage.googleapis.com/v1beta/", model: "gemini-3.5-flash-lite", apiKey: "synthetic-key" };
const request = { prompt: "Synthetic assessment", schema: { type: "object", properties: { result: { type: "string" } }, required: ["result"], additionalProperties: false } };
const complete = () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"result":"ok"}' }] } }] });
const respond = (body: unknown) => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => body }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Gemini native provider", () => {
  it("uses native generateContent JSON schema, headers and original media without credentials in its URL", async () => {
    const fetchMock = respond(complete());
    const result = await new GeminiAiProvider(config).requestJson({ ...request, system: "System", outputLanguage: "mt",
      media: [{ mimeType: "image/png", dataBase64: "c3ludGhldGlj" }], maxOutputTokens: 1500 });
    expect(result).toEqual({ result: "ok" });
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(url).not.toContain("synthetic-key");
    expect(options.headers).toMatchObject({ "x-goog-api-key": "synthetic-key" });
    expect(options.redirect).toBe("error");
    const body = JSON.parse(options.body as string);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "System" }] });
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: request.prompt }, { inlineData: { mimeType: "image/png", data: "c3ludGhldGlj" } }] }]);
    expect(body.generationConfig).toMatchObject({ maxOutputTokens: 1500, candidateCount: 1, responseMimeType: "application/json", responseJsonSchema: request.schema });
  });
  it("honours a configured cap and excludes thought parts from the assessment", async () => {
    const fetchMock = respond({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "internal non-JSON" }, { text: '{"result":' }, { text: '"ok"}' }] } }] });
    expect(await new GeminiAiProvider({ ...config, maxOutputTokens: 2048 }).requestJson(request)).toEqual({ result: "ok" });
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).generationConfig.maxOutputTokens).toBe(2048);
  });
  it.each(["MAX_TOKENS", "SAFETY", "RECITATION", "CONTINUATION", undefined])("does not accept a %s finish as successful", async (finishReason) => {
    respond({ candidates: [{ finishReason, content: { parts: [{ text: '{"result":"ok"}' }] } }] });
    await expect(new GeminiAiProvider(config).requestJson(request)).rejects.toThrow("blocked or incomplete");
  });
  it("captures usage before rejecting a blocked or invalid response", async () => {
    respond({ ...complete(), promptFeedback: { blockReason: "SAFETY" }, usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, cachedContentTokenCount: 10, thoughtsTokenCount: 30, totalTokenCount: 150 } });
    const onUsage = vi.fn();
    await expect(new GeminiAiProvider(config).requestJson({ ...request, onUsage })).rejects.toThrow("blocked the request");
    expect(onUsage).toHaveBeenCalledWith({ provider: "gemini", model: config.model, inputTokens: 100, outputTokens: 20, cachedInputTokens: 10, reasoningTokens: 30, totalTokens: 150 });
  });
  it("does not let a telemetry observer fail a completed analysis", async () => {
    respond({ ...complete(), usageMetadata: { promptTokenCount: 1 } });
    await expect(new GeminiAiProvider(config).requestJson({ ...request, onUsage: () => { throw new Error("observer unavailable"); } })).resolves.toEqual({ result: "ok" });
  });
  it.each([{}, null, [], { candidates: [] }, { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not JSON" }] } }] }, { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "[]" }] } }] }])("rejects malformed assessment %#", async (body) => {
    respond(body);
    await expect(new GeminiAiProvider(config).requestJson(request)).rejects.toThrow();
  });
  it("does not expose HTTP error bodies or retry paid calls", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429, text: async () => "sensitive synthetic upstream body" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new GeminiAiProvider(config).requestJson(request)).rejects.toThrow("Gemini request failed (429)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("aborts underlying HTTP work when its deadline expires", async () => {
    vi.useFakeTimers();
    let ioSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      ioSignal = options.signal;
      ioSignal!.addEventListener("abort", () => reject(ioSignal!.reason), { once: true });
    })));
    const promise = new GeminiAiProvider(config).requestJson({ ...request, timeoutMs: 10 });
    const assertion = expect(promise).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    expect(ioSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not send a cancelled request", async () => {
    const fetchMock = respond(complete());
    const controller = new AbortController(); controller.abort(new Error("caller cancelled"));
    await expect(new GeminiAiProvider(config).requestJson({ ...request, signal: controller.signal })).rejects.toThrow("caller cancelled");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects raw video rather than bypassing the forensic/transcription pipeline", async () => {
    const fetchMock = respond(complete());
    await expect(new GeminiAiProvider(config).requestJson({ ...request, media: [{ mimeType: "video/mp4", dataBase64: "synthetic" }] })).rejects.toThrow("Unsupported Gemini media");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 65537, NaN])("rejects invalid output cap %s before network", async (maxOutputTokens) => {
    const fetchMock = respond(complete());
    await expect(new GeminiAiProvider(config).requestJson({ ...request, maxOutputTokens })).rejects.toThrow("output token limit");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["http://fixture.invalid/v1beta", "https://user:password@fixture.invalid", "https://fixture.invalid?key=synthetic", "https://fixture.invalid#fragment"])("rejects unsafe API base %s", (baseUrl) => {
    expect(() => new GeminiAiProvider({ ...config, baseUrl })).toThrow("HTTPS API base URL");
  });
  it("rejects model path traversal and empty key", () => {
    expect(() => new GeminiAiProvider({ ...config, model: "../../malicious" })).toThrow("model identifier");
    expect(() => new GeminiAiProvider({ ...config, apiKey: " " })).toThrow("key is required");
  });
});
