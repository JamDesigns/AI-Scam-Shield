import { Readable } from "node:stream";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../local-analysis.js", () => ({ extractPcm: vi.fn() }));
import { extractPcm } from "../../../local-analysis.js";
import { encodeTranscriptionWav, GeminiMediaTranscriptionProvider } from "./gemini-media-transcription-provider.js";

const configuration = { baseUrl: "https://fixture.invalid/v1beta", model: "gemini-3.5-flash-lite", apiKey: "synthetic-key" };
const media = { filename: "fixture.mp4", mimeType: "video/mp4", sizeBytes: 100 * 1024 * 1024,
  filePath: resolve("synthetic", "fixture.mp4"), durationSeconds: 60, createReadStream: () => Readable.from("full video must not be uploaded") };
const pcm = Buffer.from([1, 0, 2, 0, 3, 0]);
const response = (value: unknown = { transcript: "Dia duit", languages: ["ga"] }) => ({
  candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
});
const setResponse = (value = response()) => {
  const mock = vi.fn(async () => ({ ok: true, json: async () => value }));
  vi.stubGlobal("fetch", mock); return mock;
};
beforeEach(() => { vi.mocked(extractPcm).mockReset(); vi.mocked(extractPcm).mockResolvedValue(pcm); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Gemini transcription of bounded extracted audio", () => {
  it("transcribes the original language using only extracted PCM WAV, with no invented confidence or word timings", async () => {
    const mock = setResponse();
    const stream = vi.fn(media.createReadStream);
    const onUsage = vi.fn();
    const result = await new GeminiMediaTranscriptionProvider(configuration).transcribe({ ...media, createReadStream: stream, onUsage });
    expect(result).toEqual({ transcript: "Dia duit", languages: ["ga"], words: [], transcriptionStatus: "transcribed" });
    expect(result).not.toHaveProperty("confidence");
    expect(stream).not.toHaveBeenCalled();
    const body = JSON.parse((mock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    const audio = body.contents[0].parts[1].inlineData;
    expect(audio.mimeType).toBe("audio/wav");
    const wav = Buffer.from(audio.data, "base64");
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.subarray(44)).toEqual(pcm);
    expect(wav.length).toBe(44 + pcm.length);
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ provider: "gemini", inputTokens: 10, outputTokens: 5 }));
  });
  it.each([Buffer.alloc(0), Buffer.alloc(32000)])("skips paid calls for absent audio or exact digital silence %#", async (silence) => {
    vi.mocked(extractPcm).mockResolvedValue(silence);
    const mock = setResponse();
    expect(await new GeminiMediaTranscriptionProvider(configuration).transcribe(media)).toEqual({ transcript: "", languages: [], words: [], transcriptionStatus: "no_speech" });
    expect(mock).not.toHaveBeenCalled();
  });
  it("does not classify nonzero quiet audio as proven silence", async () => {
    vi.mocked(extractPcm).mockResolvedValue(Buffer.from([1, 0]));
    const mock = setResponse(response({ transcript: "", languages: [] }));
    expect((await new GeminiMediaTranscriptionProvider(configuration).transcribe(media)).transcriptionStatus).toBe("unintelligible");
    expect(mock).toHaveBeenCalledOnce();
  });
  it.each([undefined, 0, -1, 181, NaN])("rejects missing or invalid trusted duration %s before extraction", async (durationSeconds) => {
    const mock = setResponse();
    await expect(new GeminiMediaTranscriptionProvider(configuration).transcribe({ ...media, durationSeconds })).rejects.toThrow("trusted server");
    expect(extractPcm).not.toHaveBeenCalled(); expect(mock).not.toHaveBeenCalled();
  });
  it("rejects missing server filepath even if an upload stream is supplied", async () => {
    await expect(new GeminiMediaTranscriptionProvider(configuration).transcribe({ ...media, filePath: undefined })).rejects.toThrow("trusted server");
    expect(extractPcm).not.toHaveBeenCalled();
  });
  it.each([Buffer.alloc(3), Buffer.alloc(180 * 16000 * 2 + 2)])("rejects invalid PCM bounds before uploading %#", async (badPcm) => {
    vi.mocked(extractPcm).mockResolvedValue(badPcm);
    const mock = setResponse();
    await expect(new GeminiMediaTranscriptionProvider(configuration).transcribe(media)).rejects.toThrow("audio size");
    expect(mock).not.toHaveBeenCalled();
  });
  it.each([{ transcript: 5, languages: [] }, { transcript: "text", languages: ["not a code"] }, { transcript: "text", languages: [], confidence: 0.99 }])("rejects malformed provider transcripts %#", async (value) => {
    setResponse(response(value));
    await expect(new GeminiMediaTranscriptionProvider(configuration).transcribe(media)).rejects.toThrow("invalid transcription data");
  });
  it("cancels extraction before any paid upload", async () => {
    vi.useFakeTimers();
    let extractionSignal: AbortSignal | undefined;
    vi.mocked(extractPcm).mockImplementation((_input, signal) => new Promise((_resolve, reject) => {
      extractionSignal = signal;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const mock = setResponse();
    const promise = new GeminiMediaTranscriptionProvider(configuration).transcribe({ ...media, timeoutMs: 10 });
    const assertion = expect(promise).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(11); await assertion;
    expect(extractionSignal?.aborted).toBe(true); expect(mock).not.toHaveBeenCalled();
  });
  it("propagates caller cancellation before extraction", async () => {
    const controller = new AbortController(); controller.abort(new Error("caller cancelled"));
    await expect(new GeminiMediaTranscriptionProvider(configuration).transcribe({ ...media, signal: controller.signal })).rejects.toThrow("caller cancelled");
    expect(extractPcm).not.toHaveBeenCalled();
  });
  it("encodes the maximum three-minute PCM without original-video buffering", () => {
    const wav = encodeTranscriptionWav(Buffer.alloc(180 * 16000 * 2));
    expect(wav.length).toBe(5_760_044);
    expect(wav.readUInt32LE(40)).toBe(5_760_000);
  });
});
