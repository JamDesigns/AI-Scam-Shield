import { z } from "zod";
import { extractPcm, localEndpoint } from "./local-analysis.js";
import { withDeadline, type DeadlineOptions } from "./runtime-deadline.js";
import type { MediaForensicsEvidence } from "./forensics/media-forensics-evidence.js";
import type { VideoFrame } from "./video/video-frame-extractor.js";

const timestamp = z.number().finite().min(0).max(180);
export const localSignalsSchema = z.object({
  scope: z.literal("sampled_frames_and_audio_windows"),
  calibratedForVideo: z.literal(false),
  frames: z.array(z.object({ timestampSeconds: timestamp, imageLogit: z.number().finite(), aboveImageThreshold: z.boolean() }).strict()).min(1).max(14),
  audioWindows: z.array(z.object({ timestampSeconds: timestamp, spoofLogit: z.number().finite(),
    bonaFideLogit: z.number().finite(), rms: z.number().finite().min(0).max(1) }).strict()).max(12),
  skippedSilentWindows: z.number().int().min(0).max(12),
}).strict().superRefine((value, context) => {
  if (value.audioWindows.length + value.skippedSilentWindows > 12
    || value.frames.some((frame) => frame.aboveImageThreshold !== (frame.imageLogit >= 1.359375))) {
    context.addIssue({ code: "custom", message: "Inconsistent local detector outputs" });
  }
});
export type LocalForensicsSignals = z.infer<typeof localSignalsSchema>;

export function unavailableLocalEvidence(): MediaForensicsEvidence {
  return { provider: "none", aiGeneratedDetected: null, deepfakeDetected: null,
    aiGeneratedStatus: "unavailable", deepfakeStatus: "unavailable", audioAiGeneratedStatus: "unavailable",
    maxAiGeneratedScore: null, maxDeepfakeScore: null, maxAiGeneratedAudioScore: null,
    topGenerator: null, suspiciousTimestamps: [] };
}

export function evidenceFromLocalSignals(signals: LocalForensicsSignals): MediaForensicsEvidence {
  // Image thresholds cannot establish a calibrated video verdict. AASIST logits are not probabilities.
  return { ...unavailableLocalEvidence(), provider: "local-experimental", aiGeneratedStatus: "inconclusive",
    audioAiGeneratedStatus: signals.audioWindows.length ? "inconclusive" : "unavailable", localSignals: signals };
}

export function createLocalForensicsAnalyzer(options: { baseUrl: string; fetchImpl?: typeof fetch }) {
  const endpoint = localEndpoint(options.baseUrl, "/analyze");
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    analyze(input: DeadlineOptions & { filePath: string; durationSeconds: number; frames: VideoFrame[] }): Promise<MediaForensicsEvidence> {
      return withDeadline(async (signal) => {
        const pcm = await extractPcm(input, signal);
        const response = await fetchImpl(endpoint, { method: "POST", redirect: "error", signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ frames: input.frames.map(({ timestampSeconds, dataBase64 }) => ({ timestampSeconds, dataBase64 })),
            audioPcm16Base64: pcm.toString("base64") }) });
        if (!response.ok) throw new Error(`Local forensics failed (${response.status})`);
        const result = localSignalsSchema.parse(await response.json());
        if (result.frames.length !== input.frames.length || result.frames.some((frame, index) => frame.timestampSeconds !== input.frames[index].timestampSeconds)
          || result.audioWindows.some((window) => window.timestampSeconds > input.durationSeconds)) {
          throw new Error("Local forensics frame coverage mismatch");
        }
        return evidenceFromLocalSignals(result);
      }, input, "Local forensics");
    },
  };
}
