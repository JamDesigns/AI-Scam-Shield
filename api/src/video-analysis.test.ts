import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const analyze = vi.fn();

  return {
    analyze,
    createPool: vi.fn(() => ({})),
    ensureDevice: vi.fn(async () => undefined),
    getPremiumStatus: vi.fn(async () => true),
    setPremiumStatus: vi.fn(async () => undefined),
    getWeeklyUsage: vi.fn(async () => 0),
    incrementWeeklyUsage: vi.fn(async () => undefined),
    getWeeklyAiUsage: vi.fn(async () => 0),
    incrementWeeklyAiUsage: vi.fn(async () => undefined),
    insertScanEvent: vi.fn(async () => undefined),
    getScanStats: vi.fn(async () => ({})),
    getScanActivity: vi.fn(async () => []),
    createMediaAnalysisJob: vi.fn(async () => undefined),
    markMediaAnalysisJobProcessing: vi.fn(async () => undefined),
    completeMediaAnalysisJob: vi.fn(async () => undefined),
    failMediaAnalysisJob: vi.fn(async () => undefined),
    getMediaAnalysisJob: vi.fn(async () => null),
    runMigrations: vi.fn(async () => undefined),
  };
});

vi.mock("./db.js", () => ({
  createPool: mocks.createPool,
  ensureDevice: mocks.ensureDevice,
  getPremiumStatus: mocks.getPremiumStatus,
  setPremiumStatus: mocks.setPremiumStatus,
  getWeeklyUsage: mocks.getWeeklyUsage,
  incrementWeeklyUsage: mocks.incrementWeeklyUsage,
  getWeeklyAiUsage: mocks.getWeeklyAiUsage,
  incrementWeeklyAiUsage: mocks.incrementWeeklyAiUsage,
  insertScanEvent: mocks.insertScanEvent,
  getScanStats: mocks.getScanStats,
  getScanActivity: mocks.getScanActivity,
  createMediaAnalysisJob: mocks.createMediaAnalysisJob,
  markMediaAnalysisJobProcessing: mocks.markMediaAnalysisJobProcessing,
  completeMediaAnalysisJob: mocks.completeMediaAnalysisJob,
  failMediaAnalysisJob: mocks.failMediaAnalysisJob,
  getMediaAnalysisJob: mocks.getMediaAnalysisJob,
}));

vi.mock("./migrations.js", () => ({
  runMigrations: mocks.runMigrations,
}));

vi.mock("./ai/ai-provider-factory.js", () => ({
  createAiProvider: vi.fn(() => null),
}));

vi.mock("./forensics/media-forensics-provider-factory.js", () => ({
  createMediaForensicsProvider: vi.fn(() => ({
    name: "hive",
    analyze: mocks.analyze,
  })),
}));

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgres://test:test@localhost:5432/scam_shield_test";
process.env.ADMIN_TOKEN = "test-admin-token";
process.env.REVENUECAT_WEBHOOK_AUTH = "test-revenuecat-token";
process.env.FORENSICS_PROVIDER = "hive";
process.env.FORENSICS_MODEL =
  "hive/ai-generated-and-deepfake-content-detection";
process.env.FORENSICS_API_KEY = "test-forensics-key";

const { app } = await import("./index.js");

function createMultipartVideoPayload(): {
  boundary: string;
  body: Buffer;
  video: Buffer;
} {
  const boundary = "----scam-shield-video-test";
  const video = Buffer.from([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70,
    0x6d, 0x70, 0x34, 0x32,
  ]);

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="outputLanguage"\r\n` +
        `\r\n` +
        `es\r\n`,
    ),
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="media"; filename="clip.mp4"\r\n` +
        `Content-Type: video/mp4\r\n` +
        `\r\n`,
    ),
    video,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  return {
    boundary,
    body,
    video,
  };
}

describe("POST /video-analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getPremiumStatus.mockResolvedValue(true);

    mocks.analyze.mockResolvedValue({
      status: "completed",
      submissionId: "hive-task-123",
      observations: [
        {
          frameIndex: 0,
          timestampSeconds: 0,
          aiGeneratedScore: 0.95,
          notAiGeneratedScore: 0.05,
          deepfakeScore: 0.1,
        },
      ],
    });
  });

  it("rejects non-multipart requests", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/video-analysis",
      headers: {
        "x-device-id": "video-test-device-non-multipart",
        "content-type": "application/json",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({
      error: "multipart_required",
    });

    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.createMediaAnalysisJob).not.toHaveBeenCalled();
  });

  it("rejects unsupported media types", async () => {
    const boundary = "----scam-shield-image-test";
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="outputLanguage"\r\n` +
          `\r\n` +
          `es\r\n`,
      ),
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="media"; filename="image.png"\r\n` +
          `Content-Type: image/png\r\n` +
          `\r\n`,
      ),
      image,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await app.inject({
      method: "POST",
      url: "/video-analysis",
      headers: {
        "x-device-id": "video-test-device-image",
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(body.length),
      },
      payload: body,
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({
      error: "unsupported_media_type",
      mimeType: "image/png",
    });

    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.createMediaAnalysisJob).not.toHaveBeenCalled();
  });

  it("returns 202 when the provider continues processing", async () => {
    mocks.analyze.mockResolvedValueOnce({
      status: "processing",
      submissionId: "hive-task-processing-123",
    });

    const { boundary, body } =
      createMultipartVideoPayload();

    const response = await app.inject({
      method: "POST",
      url: "/video-analysis",
      headers: {
        "x-device-id": "video-test-device-processing",
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(body.length),
      },
      payload: body,
    });

    expect(response.statusCode).toBe(202);

    const payload = response.json();

    expect(payload).toEqual({
      analysisId: expect.any(String),
      status: "processing",
    });

    expect(
      mocks.markMediaAnalysisJobProcessing,
    ).toHaveBeenCalledWith(
      expect.anything(),
      payload.analysisId,
      "video-test-device-processing",
      "hive-task-processing-123",
    );

    expect(
      mocks.completeMediaAnalysisJob,
    ).not.toHaveBeenCalled();

    expect(mocks.failMediaAnalysisJob).not.toHaveBeenCalled();
  });

  it("stores and returns completed forensic evidence", async () => {
    const { boundary, body, video } =
      createMultipartVideoPayload();

    const response = await app.inject({
      method: "POST",
      url: "/video-analysis",
      headers: {
        "x-device-id": "video-test-device-001",
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(body.length),
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);

    const payload = response.json();

    expect(payload).toMatchObject({
      status: "completed",
      forensics: {
        provider: "hive",
        aiGeneratedDetected: true,
        deepfakeDetected: false,
        maxAiGeneratedScore: 0.95,
        maxDeepfakeScore: 0.1,
        suspiciousTimestamps: [0],
      },
    });

    expect(payload.analysisId).toEqual(expect.any(String));

    expect(mocks.createMediaAnalysisJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: payload.analysisId,
        deviceId: "video-test-device-001",
        provider: "hive",
        filename: "clip.mp4",
        mimeType: "video/mp4",
        sizeBytes: video.length,
        outputLanguage: "es",
      }),
    );

    expect(mocks.analyze).toHaveBeenCalledTimes(1);

    expect(mocks.completeMediaAnalysisJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: payload.analysisId,
        deviceId: "video-test-device-001",
        providerSubmissionId: "hive-task-123",
      }),
    );

    expect(mocks.failMediaAnalysisJob).not.toHaveBeenCalled();
  });
});

describe("GET /video-analysis/:analysisId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMediaAnalysisJob.mockResolvedValue(null);
  });

  it("returns a completed analysis owned by the device", async () => {
    const analysisId = "28e35222-b28d-4cc1-a39a-3538865f7a03";

    mocks.getMediaAnalysisJob.mockResolvedValueOnce({
      id: analysisId,
      deviceId: "video-test-device-get",
      provider: "hive",
      providerSubmissionId: "hive-task-get-123",
      status: "completed",
      filename: "clip.mp4",
      mimeType: "video/mp4",
      sizeBytes: 1234,
      outputLanguage: "es",
      result: {
        provider: "hive",
        aiGeneratedDetected: true,
        deepfakeDetected: false,
        maxAiGeneratedScore: 0.95,
        maxDeepfakeScore: 0.1,
        maxAiGeneratedAudioScore: null,
        topGenerator: null,
        suspiciousTimestamps: [0],
      },
      errorMessage: null,
      createdAt: new Date("2026-09-23T16:00:00.000Z"),
      updatedAt: new Date("2026-09-23T16:00:02.000Z"),
      completedAt: new Date("2026-09-23T16:00:02.000Z"),
    });

    const response = await app.inject({
      method: "GET",
      url: `/video-analysis/${analysisId}`,
      headers: {
        "x-device-id": "video-test-device-get",
      },
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      analysisId,
      status: "completed",
      result: {
        provider: "hive",
        aiGeneratedDetected: true,
        deepfakeDetected: false,
        maxAiGeneratedScore: 0.95,
        maxDeepfakeScore: 0.1,
        maxAiGeneratedAudioScore: null,
        topGenerator: null,
        suspiciousTimestamps: [0],
      },
      createdAt: "2026-09-23T16:00:00.000Z",
      updatedAt: "2026-09-23T16:00:02.000Z",
      completedAt: "2026-09-23T16:00:02.000Z",
    });

    expect(mocks.getMediaAnalysisJob).toHaveBeenCalledWith(
      expect.anything(),
      analysisId,
      "video-test-device-get",
    );
  });

  it("returns 404 when the analysis does not belong to the device", async () => {
    const analysisId = "8ec4f222-8ab7-47ac-8b56-514b37f76256";

    const response = await app.inject({
      method: "GET",
      url: `/video-analysis/${analysisId}`,
      headers: {
        "x-device-id": "another-video-test-device",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "analysis_not_found",
    });

    expect(mocks.getMediaAnalysisJob).toHaveBeenCalledWith(
      expect.anything(),
      analysisId,
      "another-video-test-device",
    );
  });
});

afterAll(async () => {
  await app.close();
});
