import { afterEach, describe, expect, it, vi } from "vitest";
import { createSelfHostedForensicsAnalyzer } from "./self-hosted-forensics.js";

const mocks = vi.hoisted(() => ({ analyze: vi.fn() }));
vi.mock("../local-forensics.js", async () => {
  const actual = await vi.importActual<typeof import("../local-forensics.js")>("../local-forensics.js");
  return { ...actual, createLocalForensicsAnalyzer: (options: { baseUrl: string; trustedServiceHost?: string }) => {
    // Validate the real origin guard, but do not run models, ffmpeg or HTTP in these tests.
    actual.createLocalForensicsAnalyzer(options);
    return { analyze: mocks.analyze };
  } };
});
afterEach(() => vi.resetAllMocks());
describe("explicit self-hosted forensic routing", () => {
  it.each(["http://aiss-forensics:8081", "http://aiss-forensics-ab12:8081"])("accepts a configured private service hostname: %s", (url) => {
    expect(() => createSelfHostedForensicsAnalyzer(url)).not.toThrow();
  });
  it.each(["http://aiss-forensics:80", "https://aiss-forensics:8081", "http://203.0.113.1:8081", "http://aiss-forensics:8081/analyze", "http://aiss-forensics:8081?key=x"])("rejects an unsuitable service address: %s", (url) => {
    expect(() => createSelfHostedForensicsAnalyzer(url)).toThrow();
  });
  it.each(["https://public.invalid", "http://127.0.0.1.evil.invalid", "http://u:p@127.0.0.1", ""])("rejects an origin unsuitable for the private sidecar: %s", (url) => {
    expect(() => createSelfHostedForensicsAnalyzer(url)).toThrow();
  });
  it("retains inconclusive raw evidence and does not manufacture calibrated confidence", async () => {
    const evidence = { provider: "local-experimental", aiGeneratedStatus: "inconclusive", deepfakeStatus: "unavailable",
      audioAiGeneratedStatus: "inconclusive", aiGeneratedDetected: null, deepfakeDetected: null,
      maxAiGeneratedScore: null, maxDeepfakeScore: null, maxAiGeneratedAudioScore: null,
      topGenerator: null, suspiciousTimestamps: [], localSignals: { calibratedForVideo: false } };
    mocks.analyze.mockResolvedValue(evidence);
    const input = { filePath: "synthetic.mp4", durationSeconds: 10, frames: [] };
    const analyzer = createSelfHostedForensicsAnalyzer("http://127.0.0.1:8081");
    expect(await analyzer.analyze(input)).toEqual({ ...evidence, provider: "self-hosted-experimental" });
    expect(mocks.analyze).toHaveBeenCalledWith(input);
  });
  it("propagates unavailability without falling back to a paid vendor", async () => {
    mocks.analyze.mockRejectedValue(new Error("synthetic unavailable sidecar"));
    await expect(createSelfHostedForensicsAnalyzer("http://host.docker.internal:8081").analyze({ filePath: "synthetic.mp4", durationSeconds: 10, frames: [] })).rejects.toThrow("unavailable sidecar");
  });
});
