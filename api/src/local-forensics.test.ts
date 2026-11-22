import { describe, expect, it, vi } from "vitest";
vi.mock("./local-analysis.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./local-analysis.js")>(), extractPcm: vi.fn(async () => Buffer.alloc(0)),
}));
import { createLocalForensicsAnalyzer, evidenceFromLocalSignals, localSignalsSchema } from "./local-forensics.js";
const signals = { scope: "sampled_frames_and_audio_windows" as const, calibratedForVideo: false as const,
  frames: [{ timestampSeconds: 0, imageLogit: 9.2, aboveImageThreshold: true }],
  audioWindows: [{ timestampSeconds: 0, spoofLogit: 20, bonaFideLogit: -2, rms: .2 }], skippedSilentWindows: 0 };
const input = { filePath: "test.mp4", durationSeconds: 7, frames: [{ timestampSeconds: 0, dataBase64: "YWJj", mimeType: "image/jpeg" as const }] };
describe("experimental local forensic signals", () => {
  it("never presents uncalibrated image or audio logits as video probabilities or confirmed detections", () => {
    const result = evidenceFromLocalSignals(localSignalsSchema.parse(signals));
    expect(result).toMatchObject({ aiGeneratedDetected: null, deepfakeDetected: null, aiGeneratedStatus: "inconclusive",
      deepfakeStatus: "unavailable", audioAiGeneratedStatus: "inconclusive", maxAiGeneratedScore: null,
      maxDeepfakeScore: null, maxAiGeneratedAudioScore: null, suspiciousTimestamps: [], localSignals: signals });
  });
  it("sends bounded media only to the local endpoint and rejects redirects", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(signals));
    await createLocalForensicsAnalyzer({ baseUrl: "http://host.docker.internal:8081", fetchImpl }).analyze(input);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://host.docker.internal:8081/analyze");
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "error", signal: expect.any(AbortSignal) });
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({ audioPcm16Base64: "", frames: [{ timestampSeconds: 0, dataBase64: "YWJj" }] });
    expect(() => createLocalForensicsAnalyzer({ baseUrl: "https://external.example" })).toThrow();
  });
  it("rejects invalid results and missing or displaced frame coverage", async () => {
    for (const result of [{ ...signals, calibratedForVideo: true }, { ...signals, frames: [{ ...signals.frames[0], timestampSeconds: 3 }] }]) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(result));
      await expect(createLocalForensicsAnalyzer({ baseUrl: "http://127.0.0.1:8081", fetchImpl }).analyze(input)).rejects.toThrow();
    }
  });
  it("fails unavailable services rather than silently manufacturing a result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(createLocalForensicsAnalyzer({ baseUrl: "http://127.0.0.1:8081", fetchImpl }).analyze(input)).rejects.toThrow();
  });
});
