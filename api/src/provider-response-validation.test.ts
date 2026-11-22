import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HiveMediaForensicsProvider } from "./forensics/providers/hive/hive-media-forensics-provider.js";
import { DeepgramMediaTranscriptionProvider } from "./transcription/providers/deepgram/deepgram-media-transcription-provider.js";
import { buildMediaForensicsEvidence } from "./forensics/media-forensics-evidence.js";

const media = { filename: "fixture.mp4", mimeType: "video/mp4", sizeBytes: 5, createReadStream: () => Readable.from("video") };
const hive = () => new HiveMediaForensicsProvider({ baseUrl: "https://fixture.invalid", model: "fixture", apiKey: "fixture" });
const deepgram = () => new DeepgramMediaTranscriptionProvider({ baseUrl: "https://fixture.invalid", model: "fixture", apiKey: "fixture" });
describe("external media result validation", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([{}, { classes: [] }, { classes: [{ class: "ai_generated", value: 2 }] }, { classes: [{ class: "deepfake", value: "0.95" }] }, { classes: [{ class: "deepfake", value: Number.NaN }] }])("rejects invalid Hive observations %#", async (output) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ task_id: "fixture", output: [output] }) }));
    await expect(hive().analyze(media)).rejects.toThrow("invalid observations");
  });
  it("preserves Hive inconclusive_video through mapping and final evidence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ task_id: "fixture", output: [{ classes: [{ class: "inconclusive_video", value: 0.99 }] }] }) }));
    const result = await hive().analyze(media);
    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("Expected completed fixture");
    const evidence = buildMediaForensicsEvidence({ provider: "hive", mimeType: "video/mp4", result });
    expect(evidence.aiGeneratedStatus).toBe("inconclusive");
    expect(evidence.deepfakeStatus).toBe("inconclusive");
    expect(evidence.aiGeneratedDetected).toBeNull();
    expect(evidence.deepfakeDetected).toBeNull();
  });
  it.each([{}, { transcript: 4 }, { transcript: "Hello", confidence: 1.5 }, { transcript: "Hello", words: [{ word: "Hello", start: 2, end: 1 }] }])("rejects invalid Deepgram output instead of inventing silence %#", async (alternative) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: { channels: [{ alternatives: [alternative] }] } }) }));
    await expect(deepgram().transcribe(media)).rejects.toThrow("invalid transcription data");
  });
  it("accepts an explicit empty transcript as no recognised speech, without inventing absent audio", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: { channels: [{ alternatives: [{ transcript: "", words: [] }] }] } }) }));
    expect((await deepgram().transcribe(media)).transcript).toBe("");
  });
});
