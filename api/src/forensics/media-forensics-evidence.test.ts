import { describe, expect, it } from "vitest";

import { buildMediaForensicsEvidence } from "./media-forensics-evidence.js";

describe("buildMediaForensicsEvidence", () => {
  it("detects AI-generated image evidence at the Hive threshold", () => {
    const evidence = buildMediaForensicsEvidence({
      provider: "hive",
      mimeType: "image/png",
      result: {
        status: "completed",
        observations: [
          {
            frameIndex: 0,
            timestampSeconds: 0,
            aiGeneratedScore: 0.95,
            notAiGeneratedScore: 0.05,
            deepfakeScore: 0.1,
            generatorScores: [
              {
                name: "stablediffusionxl",
                score: 0.92,
              },
            ],
          },
        ],
      },
    });

    expect(evidence.aiGeneratedDetected).toBe(true);
    expect(evidence.deepfakeDetected).toBe(false);
    expect(evidence.maxAiGeneratedScore).toBe(0.95);
    expect(evidence.topGenerator).toEqual({
      name: "stablediffusionxl",
      score: 0.92,
    });
    expect(evidence.suspiciousTimestamps).toEqual([0]);
  });

  it("detects deepfake image evidence at the Hive threshold", () => {
    const evidence = buildMediaForensicsEvidence({
      provider: "hive",
      mimeType: "image/jpeg",
      result: {
        status: "completed",
        observations: [
          {
            deepfakeScore: 0.91,
            aiGeneratedScore: 0.2,
          },
        ],
      },
    });

    expect(evidence.aiGeneratedDetected).toBe(false);
    expect(evidence.deepfakeDetected).toBe(true);
  });

  it("detects video deepfake evidence from consecutive qualifying frames", () => {
    const evidence = buildMediaForensicsEvidence({
      provider: "hive",
      mimeType: "video/mp4",
      result: {
        status: "completed",
        observations: [
          {
            frameIndex: 0,
            timestampSeconds: 0,
            deepfakeScore: 0.1,
          },
          {
            frameIndex: 1,
            timestampSeconds: 1,
            deepfakeScore: 0.7,
          },
          {
            frameIndex: 2,
            timestampSeconds: 2,
            deepfakeScore: 0.8,
          },
          {
            frameIndex: 3,
            timestampSeconds: 3,
            deepfakeScore: 0.1,
          },
        ],
      },
    });

    expect(evidence.deepfakeDetected).toBe(true);
    expect(evidence.suspiciousTimestamps).toEqual([1, 2]);
  });

  it("detects video deepfake evidence when at least five percent of frames qualify", () => {
    const observations = Array.from(
      { length: 20 },
      (_, frameIndex) => ({
        frameIndex,
        timestampSeconds: frameIndex,
        deepfakeScore: frameIndex === 10 ? 0.75 : 0.1,
      }),
    );

    const evidence = buildMediaForensicsEvidence({
      provider: "hive",
      mimeType: "video/mp4",
      result: {
        status: "completed",
        observations,
      },
    });

    expect(evidence.deepfakeDetected).toBe(true);
    expect(evidence.suspiciousTimestamps).toEqual([10]);
  });

  it("keeps evidence below Hive thresholds as not detected", () => {
    const evidence = buildMediaForensicsEvidence({
      provider: "hive",
      mimeType: "video/mp4",
      result: {
        status: "completed",
        observations: [
          {
            frameIndex: 0,
            timestampSeconds: 0,
            aiGeneratedScore: 0.89,
            deepfakeScore: 0.49,
            aiGeneratedAudioScore: 0.98,
          },
          {
            frameIndex: 1,
            timestampSeconds: 1,
            aiGeneratedScore: 0.4,
            deepfakeScore: 0.49,
            aiGeneratedAudioScore: 0.2,
          },
        ],
      },
    });

    expect(evidence.aiGeneratedDetected).toBe(false);
    expect(evidence.deepfakeDetected).toBe(false);
    expect(evidence.maxAiGeneratedAudioScore).toBe(0.98);
    expect(evidence.suspiciousTimestamps).toEqual([]);
  });

  it("rejects providers without evidence rules", () => {
    expect(() =>
      buildMediaForensicsEvidence({
        provider: "unknown",
        mimeType: "video/mp4",
        result: {
          status: "completed",
          observations: [],
        },
      }),
    ).toThrow(
      'Unsupported media forensics evidence provider "unknown"',
    );
  });
});
