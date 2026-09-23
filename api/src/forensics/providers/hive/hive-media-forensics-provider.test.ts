import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HiveMediaForensicsProvider } from "./hive-media-forensics-provider.js";

describe("HiveMediaForensicsProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends media to Hive and maps the response to normalized observations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        task_id: "task-123",
        model: "hive/ai-generated-and-deepfake-content-detection",
        output: [
          {
            extra: [
              {
                name: "frame_index",
                value: 12,
              },
              {
                name: "timestamp",
                value: 3.5,
              },
            ],
            classes: [
              {
                class: "not_ai_generated",
                value: 0.05,
              },
              {
                class: "ai_generated",
                value: 0.95,
              },
              {
                class: "deepfake",
                value: 0.8,
              },
              {
                class: "not_ai_generated_audio",
                value: 0.9,
              },
              {
                class: "ai_generated_audio",
                value: 0.1,
              },
              {
                class: "stablediffusionxl",
                value: 0.92,
              },
              {
                class: "none",
                value: 0.08,
              },
            ],
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new HiveMediaForensicsProvider({
      baseUrl: "https://api.thehive.ai/api/v3/",
      model: "hive/ai-generated-and-deepfake-content-detection",
      apiKey: "hive-test-key",
    });

    const result = await provider.analyze({
      filename: "test.mp4",
      mimeType: "video/mp4",
      sizeBytes: 5,
      createReadStream: () =>
        Readable.from(Buffer.from("video")),
    });

    expect(result).toEqual({
      status: "completed",
      submissionId: "task-123",
      observations: [
        {
          frameIndex: 12,
          timestampSeconds: 3.5,
          aiGeneratedScore: 0.95,
          notAiGeneratedScore: 0.05,
          deepfakeScore: 0.8,
          aiGeneratedAudioScore: 0.1,
          notAiGeneratedAudioScore: 0.9,
          generatorScores: [
            {
              name: "stablediffusionxl",
              score: 0.92,
            },
          ],
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, request] = fetchMock.mock.calls[0];

    expect(url).toBe(
      "https://api.thehive.ai/api/v3/hive/ai-generated-and-deepfake-content-detection",
    );
    expect(request.method).toBe("POST");
    expect(request.headers.Authorization).toBe(
      "Bearer hive-test-key",
    );
    expect(request.headers["content-type"]).toContain(
      "multipart/form-data; boundary=",
    );
  });

  it("rejects unsupported media types", async () => {
    const provider = new HiveMediaForensicsProvider({
      baseUrl: "https://api.thehive.ai/api/v3",
      model: "hive/ai-generated-and-deepfake-content-detection",
      apiKey: "hive-test-key",
    });

    await expect(
      provider.analyze({
        filename: "document.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
        createReadStream: () =>
          Readable.from(Buffer.from("pdf")),
      }),
    ).rejects.toThrow(
      'Hive provider does not support media type "application/pdf"',
    );
  });

  it("throws when Hive returns an HTTP error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Daily request limit exceeded",
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new HiveMediaForensicsProvider({
      baseUrl: "https://api.thehive.ai/api/v3",
      model: "hive/ai-generated-and-deepfake-content-detection",
      apiKey: "hive-test-key",
    });

    await expect(
      provider.analyze({
        filename: "test.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 5,
        createReadStream: () =>
          Readable.from(Buffer.from("image")),
      }),
    ).rejects.toThrow(
      "Hive request failed (429): Daily request limit exceeded",
    );
  });

  it("rejects an invalid Hive response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new HiveMediaForensicsProvider({
      baseUrl: "https://api.thehive.ai/api/v3",
      model: "hive/ai-generated-and-deepfake-content-detection",
      apiKey: "hive-test-key",
    });

    await expect(
      provider.analyze({
        filename: "test.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 5,
        createReadStream: () =>
          Readable.from(Buffer.from("image")),
      }),
    ).rejects.toThrow(
      "Hive response did not include a task_id",
    );
  });
});
