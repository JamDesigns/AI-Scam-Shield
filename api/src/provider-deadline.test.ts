import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaAiProvider } from "./ai/providers/ollama/ollama-ai-provider.js";
import { OpenAiProvider } from "./ai/providers/openai/openai-ai-provider.js";
import { HiveMediaForensicsProvider } from "./forensics/providers/hive/hive-media-forensics-provider.js";
import { DeepgramMediaTranscriptionProvider } from "./transcription/providers/deepgram/deepgram-media-transcription-provider.js";

const request = { prompt: "Fixture", schema: { type: "object", properties: {}, required: [] }, timeoutMs: 20 };
const media = { filename: "fixture.mp4", mimeType: "video/mp4", sizeBytes: 5, createReadStream: () => Readable.from("video"), timeoutMs: 20 };
describe("provider cancellation", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it.each([
    ["Ollama", (signal?: AbortSignal) => new OllamaAiProvider({ baseUrl: "http://fixture.invalid", model: "fixture" }).requestJson({ ...request, signal })],
    ["OpenAI", (signal?: AbortSignal) => new OpenAiProvider({ baseUrl: "https://fixture.invalid", model: "fixture", apiKey: "fixture" }).requestJson({ ...request, signal })],
    ["Hive", (signal?: AbortSignal) => new HiveMediaForensicsProvider({ baseUrl: "https://fixture.invalid", model: "fixture", apiKey: "fixture" }).analyze({ ...media, signal })],
    ["Deepgram", (signal?: AbortSignal) => new DeepgramMediaTranscriptionProvider({ baseUrl: "https://fixture.invalid", model: "fixture", apiKey: "fixture" }).transcribe({ ...media, signal })],
  ] as const)("aborts the actual %s fetch signal on deadline", async (_name, invoke) => {
    vi.useFakeTimers();
    let ioSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: unknown, options: RequestInit) => new Promise((_resolve, reject) => {
      ioSignal = options.signal ?? undefined;
      ioSignal?.addEventListener("abort", () => reject(ioSignal?.reason), { once: true });
    })));
    const result = invoke();
    const assertion = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(ioSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("propagates caller cancellation before any network call", async () => {
    const abort = new AbortController(); abort.abort(new Error("Cancelled operation"));
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(new OllamaAiProvider({ baseUrl: "http://fixture.invalid", model: "fixture" }).requestJson({ ...request, signal: abort.signal })).rejects.toThrow("Cancelled operation");
    expect(fetch).not.toHaveBeenCalled();
  });
});
