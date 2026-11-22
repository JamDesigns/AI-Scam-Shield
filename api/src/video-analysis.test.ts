import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const analyze = vi.fn();
  const transcribe = vi.fn();
  const requestJson = vi.fn();
  const extractVideoFrames = vi.fn();
  const translateWithDeepL = vi.fn(
    async (params: { text: string }) => ({ text: params.text }),
  );

  return {
    analyze,
    transcribe,
    transcribeLocalVideo: vi.fn(),
    localForensicsAnalyze: vi.fn(),
    hiddenContentAnalyze: vi.fn(),
    requestJson,
    extractVideoFrames,
    getVideoDurationSeconds: vi.fn(async () => 30),
    reserveScanOperation: vi.fn(),
    completeScanOperation: vi.fn(async (_pool, _operation, _event, response) => response),
    failScanOperation: vi.fn(async () => undefined),
    translateWithDeepL,
    translationBatch: vi.fn(async (request: { texts: string[] }) => request.texts),
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

vi.mock("./device-sessions.js", () => ({
  authenticateDeviceSession: vi.fn(async (_pool, headers) => headers.authorization === `Bearer ${"a".repeat(64)}`
    ? { deviceId: headers.deviceId, timeZone: "Europe/Madrid" } : null),
  issueDeviceSession: vi.fn(),
}));

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

vi.mock("./scan-operations.js", () => ({
  getTimeContext: vi.fn(), getUsageSnapshot: vi.fn(),
  reserveScanOperation: mocks.reserveScanOperation,
  completeScanOperation: mocks.completeScanOperation,
  failScanOperation: mocks.failScanOperation,
}));

vi.mock("./migrations.js", () => ({
  runMigrations: mocks.runMigrations,
}));

vi.mock("./ai/ai-provider-factory.js", () => ({
  createAiProvider: vi.fn(() => ({
    name: "test-ai",
    requestJson: mocks.requestJson,
  })),
}));

vi.mock("./forensics/media-forensics-provider-factory.js", () => ({
  createMediaForensicsProvider: vi.fn(() => ({
    name: "hive",
    analyze: mocks.analyze,
  })),
}));

vi.mock("./transcription/media-transcription-provider-factory.js", () => ({
  createMediaTranscriptionProvider: vi.fn(() => ({
    name: "deepgram",
    transcribe: mocks.transcribe,
  })),
}));

vi.mock("./video/video-frame-extractor.js", () => ({
  extractVideoFrames: mocks.extractVideoFrames,
  getVideoDurationSeconds: mocks.getVideoDurationSeconds,
  MAX_VIDEO_DURATION_SECONDS: 180,
}));

vi.mock("./translate.js", () => ({
  translateWithDeepL: mocks.translateWithDeepL,
}));

vi.mock("./translation/deepl-translation-provider.js", () => ({
  createTranslationProvider: (config: { profile: string; provider?: string }) =>
    config.profile === "local" || config.provider === "none" ? null : { name: "deepl", translate: mocks.translationBatch },
}));

vi.mock("./local-analysis.js", () => ({
  createLocalAnalyzer: () => ({
    provider: { name: "local-test-ai", requestJson: mocks.requestJson },
    transcribeVideo: mocks.transcribeLocalVideo,
  }),
}));
vi.mock("./hidden-content/media-hidden-content.js", async importOriginal => ({
  ...await importOriginal<typeof import("./hidden-content/media-hidden-content.js")>(),
  analyzeMediaHiddenContent: mocks.hiddenContentAnalyze,
}));
vi.mock("./local-forensics.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./local-forensics.js")>(),
  createLocalForensicsAnalyzer: vi.fn(() => ({ analyze: mocks.localForensicsAnalyze })),
}));

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgres://test:test@localhost:5432/scam_shield_test";
process.env.ADMIN_TOKEN = "test-admin-token";
process.env.REVENUECAT_WEBHOOK_AUTH = "test-revenuecat-token";
process.env.REVENUECAT_API_KEY = "";
process.env.FORENSICS_PROVIDER = "hive";
process.env.FORENSICS_MODEL =
  "hive/ai-generated-and-deepfake-content-detection";
process.env.FORENSICS_API_KEY = "test-forensics-key";
process.env.TRANSCRIPTION_PROVIDER = "deepgram";
process.env.TRANSCRIPTION_MODEL = "nova-3";
process.env.TRANSCRIPTION_API_KEY = "test-transcription-key";
process.env.DEEPL_AUTH_KEY = "test-deepl-key";
process.env.DEEPL_API_BASE = "https://api-free.deepl.com";

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
    mocks.translationBatch.mockReset().mockImplementation(async (request: { texts: string[] }) => request.texts);
    mocks.hiddenContentAnalyze.mockResolvedValue({ version: 1, status: "bounded_partial_scan",
      zipStatus: "no_recognized_appended_zip", encryptedEntriesDeclared: 0,
      audioScan: "unsupported_or_lossy_audio", frameScan: "unsupported_or_lossy_pixels",
      subtitleScan: "no_subtitle_track", metadataScanned: true,
      audioPrefixSeconds: 0, frameTimestamps: [], candidates: [],
    });

    mocks.getPremiumStatus.mockResolvedValue(true);
    mocks.getVideoDurationSeconds.mockResolvedValue(30);
    mocks.reserveScanOperation.mockImplementation(async (_pool, params) => ({ replay: false, operation: {
      id: "6d57a6b2-d5b4-41c7-a777-55f5f0bc4411", leaseToken: "lease-1", deviceId: params.deviceId,
      isPremium: true, aiUsed: true, kind: params.kind, ordinal: null,
      context: { timeZone: params.timeZone, yearWeek: "2026-W44", asOf: "2026-10-30T12:00:00Z", resetAt: "2026-11-01T23:00:00Z" },
    } }));

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

    mocks.transcribe.mockResolvedValue({
      requestId: "deepgram-request-123",
      transcript: "Hola, esta es una prueba.",
      confidence: 0.98,
      languages: ["es"],
      words: [
        {
          text: "Hola,",
          startSeconds: 0.5,
          endSeconds: 0.9,
          confidence: 0.99,
          language: "es",
        },
      ],
    });

    mocks.extractVideoFrames.mockResolvedValue([
      {
        timestampSeconds: 1,
        dataBase64: "frame-one-base64",
        mimeType: "image/jpeg",
      },
      {
        timestampSeconds: 3,
        dataBase64: "frame-two-base64",
        mimeType: "image/jpeg",
      },
    ]);

    mocks.requestJson.mockResolvedValue({
      riskScore: 12,
      category: "low_risk",
      threatType: "none",
      contentContext: "educational_or_reporting",
      deceptiveSolicitation: false,
      financialInstitutionImpersonation: false,
      reasons: ["No clear scam indicators"],
      explanation: "No clear scam pattern was detected.",
    });
  });

  it("rejects non-multipart requests", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/video-analysis",
      headers: { authorization: `Bearer ${"a".repeat(64)}`,
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

  it("uses local audio and frames while recording unavailable forensic evidence", async () => {
    vi.stubEnv("ANALYSIS_PROFILE", "local");
    vi.stubEnv("LOCAL_AI_BASE_URL", "http://127.0.0.1:8080/v1");
    vi.stubEnv("LOCAL_AI_MODEL", "test-local");
    vi.resetModules();
    const { app: localApp } = await import("./index.js");
    try {
      mocks.transcribeLocalVideo.mockResolvedValueOnce({ transcript: "Local test audio", languages: ["en"] });
      const { boundary, body } = createMultipartVideoPayload();
      const response = await localApp.inject({
        method: "POST", url: "/video-analysis", payload: body,
        headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "local-video-test",
          "content-type": `multipart/form-data; boundary=${boundary}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "completed", durationSeconds: 30,
        transcription: { provider: "local-test-ai", hasSpeech: true, languages: ["en"] },
        forensics: { aiGeneratedDetected: null, deepfakeDetected: null, aiGeneratedStatus: "unavailable",
          deepfakeStatus: "unavailable", audioAiGeneratedStatus: "unavailable" },
      });
      expect(mocks.hiddenContentAnalyze).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 30, signal: expect.any(AbortSignal) }));
      expect(response.json().hiddenContent).toMatchObject({ version: 1, status: "bounded_partial_scan" });
      expect(mocks.transcribeLocalVideo).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 30, signal: expect.any(AbortSignal) }));
      expect(mocks.requestJson).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining("Local test audio") }));
      expect(mocks.completeScanOperation).toHaveBeenCalledTimes(1);
      expect(mocks.analyze).not.toHaveBeenCalled();
      expect(mocks.transcribe).not.toHaveBeenCalled();
      expect(mocks.translateWithDeepL).not.toHaveBeenCalled();
    } finally {
      await localApp.close();
      vi.unstubAllEnvs();
    }
  });

  it("keeps local text and image analysis off external translation even with a configured key", async () => {
    vi.stubEnv("ANALYSIS_PROFILE", "local");
    vi.stubEnv("LOCAL_AI_BASE_URL", "http://127.0.0.1:8080/v1");
    vi.stubEnv("LOCAL_AI_MODEL", "test-local");
    vi.resetModules();
    const { app: localApp } = await import("./index.js");
    const headers = { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "local-text-image-test" };
    try {
      mocks.requestJson.mockResolvedValueOnce({ riskScore: 85, category: "high_risk", threatType: "account_takeover",
        reasons: ["Solicita tu contraseÃ±a"], explanation: "No compartas tu contraseÃ±a." });
      const text = await localApp.inject({ method: "POST", url: "/scan", headers,
        payload: { input: "Send your password immediately", outputLanguage: "es" } });
      expect(text.statusCode).toBe(200);
      mocks.requestJson.mockResolvedValueOnce({ category: "inconclusive", confidence: "low",
        visualStyle: "unclear", subjectType: "unclear", contextWarningLevel: "low",
        manipulationLikelihood: "low", generationLikelihood: "low", ordinarySceneLikelihood: "low",
        artificialSubjectEvidence: "low", roleContextMismatchLevel: "low", sensitiveOrFraudContextLevel: "low",
        reasons: ["Evidencia insuficiente"], explanation: "No se puede confirmar la autenticidad.", disclaimer: "Es una estimaciÃ³n." });
      const image = await localApp.inject({ method: "POST", url: "/image-authenticity", headers,
        payload: { imageSignals: "synthetic test", imageBase64: "YWJj", outputLanguage: "es" } });
      expect(image.statusCode).toBe(200);
      expect(mocks.requestJson).toHaveBeenCalledTimes(2);
      expect(mocks.requestJson.mock.calls[1][0].media).toEqual([{ mimeType: "image/jpeg", dataBase64: "YWJj" }]);
      expect(mocks.translateWithDeepL).not.toHaveBeenCalled();
      expect(mocks.analyze).not.toHaveBeenCalled();
      expect(mocks.transcribe).not.toHaveBeenCalled();
    } finally { await localApp.close(); vi.unstubAllEnvs(); }
  });

  it("fails a local transcription without completing or consuming the scan", async () => {
    vi.stubEnv("ANALYSIS_PROFILE", "local");
    vi.stubEnv("LOCAL_AI_BASE_URL", "http://127.0.0.1:8080/v1");
    vi.stubEnv("LOCAL_AI_MODEL", "test-local");
    vi.resetModules();
    const { app: localApp } = await import("./index.js");
    try {
      mocks.transcribeLocalVideo.mockRejectedValueOnce(new Error("Model stopped"));
      const { boundary, body } = createMultipartVideoPayload();
      const response = await localApp.inject({ method: "POST", url: "/video-analysis", payload: body,
        headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "local-failure-test",
          "content-type": `multipart/form-data; boundary=${boundary}` } });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ error: "transcription_unavailable" });
      expect(mocks.completeScanOperation).not.toHaveBeenCalled();
      expect(mocks.failScanOperation).toHaveBeenCalledOnce();
      expect(mocks.incrementWeeklyUsage).not.toHaveBeenCalled();
      expect(mocks.incrementWeeklyAiUsage).not.toHaveBeenCalled();
      expect(mocks.analyze).not.toHaveBeenCalled();
      expect(mocks.transcribe).not.toHaveBeenCalled();
    } finally { await localApp.close(); vi.unstubAllEnvs(); }
  });

  it("uses configured local forensic evidence and fails without completing when that service stops", async () => {
    vi.stubEnv("ANALYSIS_PROFILE", "local");
    vi.stubEnv("LOCAL_AI_BASE_URL", "http://127.0.0.1:8080/v1");
    vi.stubEnv("LOCAL_AI_MODEL", "test-local");
    vi.stubEnv("LOCAL_FORENSICS_BASE_URL", "http://127.0.0.1:8081");
    vi.resetModules();
    const { app: localApp } = await import("./index.js");
    const evidence = { provider: "local-experimental", aiGeneratedDetected: null, deepfakeDetected: null,
      aiGeneratedStatus: "inconclusive", deepfakeStatus: "unavailable", audioAiGeneratedStatus: "inconclusive",
      maxAiGeneratedScore: null, maxDeepfakeScore: null, maxAiGeneratedAudioScore: null, topGenerator: null, suspiciousTimestamps: [] };
    try {
      mocks.transcribeLocalVideo.mockResolvedValue({ transcript: "Local test audio", languages: [] });
      mocks.localForensicsAnalyze.mockResolvedValueOnce(evidence).mockRejectedValueOnce(new Error("Service stopped"));
      const { boundary, body } = createMultipartVideoPayload();
      const request = { method: "POST" as const, url: "/video-analysis", payload: body,
        headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "local-forensics-test",
          "content-type": `multipart/form-data; boundary=${boundary}` } };
      const result = await localApp.inject(request);
      expect(result.statusCode).toBe(200);
      expect(result.json().forensics).toEqual(evidence);
      expect(mocks.localForensicsAnalyze).toHaveBeenCalledWith(expect.objectContaining({ frames: expect.any(Array), signal: expect.any(AbortSignal) }));
      mocks.completeScanOperation.mockClear();
      const failed = await localApp.inject(request);
      expect(failed.statusCode).toBe(503);
      expect(failed.json()).toMatchObject({ error: "forensics_unavailable" });
      expect(mocks.completeScanOperation).not.toHaveBeenCalled();
      expect(mocks.failScanOperation).toHaveBeenCalledOnce();
      expect(mocks.analyze).not.toHaveBeenCalled();
      expect(mocks.transcribe).not.toHaveBeenCalled();
    } finally { await localApp.close(); vi.unstubAllEnvs(); }
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
      headers: { authorization: `Bearer ${"a".repeat(64)}`,
        "x-device-id": "video-test-device-image",
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(body.length),
      },
      payload: body,
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({
      error: "unsupported_media_type",
    });

    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.createMediaAnalysisJob).not.toHaveBeenCalled();
  });

  it("does not charge or report success for an unfinished provider job", async () => {
    mocks.analyze.mockResolvedValueOnce({ status: "processing", submissionId: "pending-123" });
    const { boundary, body } = createMultipartVideoPayload();
    const response = await app.inject({ method: "POST", url: "/video-analysis",
      headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "processing-device", "content-type": `multipart/form-data; boundary=${boundary}` }, payload: body });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("forensics_pending");
    expect(mocks.completeScanOperation).not.toHaveBeenCalled();
    expect(mocks.failScanOperation).toHaveBeenCalledOnce();
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("rejects videos above 180 seconds before reservation or any provider", async () => {
    mocks.getVideoDurationSeconds.mockResolvedValueOnce(180.01);
    const { boundary, body } = createMultipartVideoPayload();
    const response = await app.inject({ method: "POST", url: "/video-analysis",
      headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "long-video-device", "content-type": `multipart/form-data; boundary=${boundary}` }, payload: body });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "video_too_long", maxDurationSeconds: 180 });
    expect(mocks.reserveScanOperation).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(mocks.requestJson).not.toHaveBeenCalled();
  });

  it.each([179.999, 180, 180.001])("validates the exact duration boundary %s before providers", async (duration) => {
    mocks.getVideoDurationSeconds.mockResolvedValueOnce(duration);
    const { boundary, body } = createMultipartVideoPayload();
    const response = await app.inject({ method: "POST", url: "/video-analysis", headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "duration-boundary-device", "content-type": `multipart/form-data; boundary=${boundary}` }, payload: body });
    if (duration > 180) {
      expect(response.statusCode).toBe(400);
      expect(mocks.reserveScanOperation).not.toHaveBeenCalled();
      expect(mocks.analyze).not.toHaveBeenCalled();
    } else {
      expect(response.statusCode).toBe(200);
      expect(mocks.extractVideoFrames).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: duration }));
    }
  });

  it("aborts the total pipeline at 90 seconds and ignores a provider that finishes late", async () => {
    vi.useFakeTimers();
    try {
      const evidence = { status: "completed", submissionId: "slow-synthetic", observations: [] };
      mocks.analyze.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(evidence), 40_000)));
      mocks.transcribe.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({ transcript: "", languages: [] }), 40_000)));
      let frameSignal: AbortSignal | undefined;
      mocks.extractVideoFrames.mockImplementationOnce((params) => {
        frameSignal = params.signal;
        return new Promise((resolve) => setTimeout(() => resolve([]), 20_000));
      });
      const { boundary, body } = createMultipartVideoPayload();
      const pending = app.inject({ method: "POST", url: "/video-analysis", headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "global-deadline-device", "content-type": `multipart/form-data; boundary=${boundary}` }, payload: body });
      await vi.waitFor(() => expect(mocks.analyze).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(80_000);
      await vi.waitFor(() => expect(mocks.extractVideoFrames).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(10_001);
      const response = await pending;
      expect(response.statusCode).toBe(503);
      expect(response.json().error).toBe("operation_timeout");
      expect(frameSignal?.aborted).toBe(true);
      expect(mocks.completeScanOperation).not.toHaveBeenCalled();
      expect(mocks.failScanOperation).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(mocks.requestJson).not.toHaveBeenCalled();
      expect(mocks.completeScanOperation).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("does not fall back to a successful classic scan when required AI fails", async () => {
    mocks.requestJson.mockRejectedValueOnce(new Error("offline"));
    const response = await app.inject({ method: "POST", url: "/scan",
      headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "first-ai-device", "idempotency-key": "first-ai-uuid-001", "x-time-zone": "Europe/Madrid" },
      payload: { input: "An ordinary synthetic test", outputLanguage: "es" } });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("ai_unavailable");
    expect(mocks.completeScanOperation).not.toHaveBeenCalled();
    expect(mocks.failScanOperation).toHaveBeenCalledOnce();
  });

  it("leaves Free usable after an unavailable subscription refresh", async () => {
    const response = await app.inject({ method: "POST", url: "/subscriptions/sync", headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "free-without-billing-configuration" }, payload: {} });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("subscription_sync_unavailable");
    expect(mocks.reserveScanOperation).not.toHaveBeenCalled();
    mocks.reserveScanOperation.mockResolvedValueOnce({ replay: false, operation: { id: "free-first-after-sync-unavailable", leaseToken: "lease", deviceId: "free-without-billing-configuration",
      kind: "text", aiUsed: true, isPremium: false, ordinal: 1, context: { timeZone: "Europe/Madrid", yearWeek: "2026-W44", resetAt: "2026-11-01T23:00:00Z" } } });
    mocks.requestJson.mockResolvedValueOnce({ riskScore: 10, category: "low_risk", threatType: "none", reasons: [], explanation: "No clear signals in this synthetic test." });
    const scan = await app.inject({ method: "POST", url: "/scan", headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "free-without-billing-configuration" }, payload: { input: "Synthetic public bulletin" } });
    expect(scan.statusCode).toBe(200);
    expect(mocks.completeScanOperation).toHaveBeenCalledOnce();
    expect(mocks.completeScanOperation.mock.calls[0][1]).toMatchObject({ isPremium: false, aiUsed: true, ordinal: 1 });
  });

  it("rejects an unsupported output language before reservation", async () => {
    const response = await app.inject({ method: "POST", url: "/scan", headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "unsupported-language-device" }, payload: { input: "Synthetic message", outputLanguage: "xx" } });
    expect(response.statusCode).toBe(400);
    expect(mocks.reserveScanOperation).not.toHaveBeenCalled();
    expect(mocks.requestJson).not.toHaveBeenCalled();
  });

  it("passes OCR in its original language and QR separately, recording one image event", async () => {
    mocks.requestJson.mockResolvedValueOnce({ authenticity: "inconclusive", confidence: "low", reasons: [], explanation: "No hay evidencia suficiente." })
      .mockResolvedValueOnce({ fraudAssessment: "inconclusive", confidence: "low", reasons: [], explanation: "El contexto no permite una conclusiÃ³n." });
    const response = await app.inject({ method: "POST", url: "/media-analysis", headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "synthetic-image-device", "idempotency-key": "image-retry-key-001" },
      payload: { imageBase64: "synthetic-base64", extractedText: "Votre compte", qrContents: ["https://example.com/full-path"], contextText: "Prueba de contexto", outputLanguage: "es" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ fraudAssessment: "inconclusive", category: "inconclusive", riskScore: null });
    expect(mocks.completeScanOperation).toHaveBeenCalledOnce();
    expect(mocks.completeScanOperation.mock.calls[0][2]).toMatchObject({ inputPreview: "[image]", finalCategory: "inconclusive", finalRiskScore: null, isThreat: false });
    const fraudPrompt = mocks.requestJson.mock.calls[1][0].prompt;
    expect(fraudPrompt).toContain("Votre compte");
    expect(fraudPrompt).toContain("https://example.com/full-path");
    expect(fraudPrompt).toContain("Prueba de contexto");
  });

  it("rejects invalid AI output instead of recording safe-looking statistics", async () => {
    mocks.requestJson.mockResolvedValueOnce({});
    const response = await app.inject({ method: "POST", url: "/scan", headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "invalid-ai-device" }, payload: { input: "Synthetic sample" } });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("invalid_ai_analysis");
    expect(mocks.completeScanOperation).not.toHaveBeenCalled();
    expect(mocks.failScanOperation).toHaveBeenCalledOnce();
  });

  it("runs the later free text scan without calling AI", async () => {
    mocks.reserveScanOperation.mockResolvedValueOnce({ replay: false, operation: {
      id: "normal-op", leaseToken: "normal-lease", deviceId: "normal-device", kind: "text", aiUsed: false, isPremium: false, ordinal: 2,
      context: { timeZone: "UTC", yearWeek: "2026-W44", resetAt: "2026-11-02T00:00:00Z" },
    } });
    const response = await app.inject({ method: "POST", url: "/scan", headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "normal-device" }, payload: { input: "Public weather bulletin" } });
    expect(response.statusCode).toBe(200);
    expect(mocks.requestJson).not.toHaveBeenCalled();
    expect(mocks.completeScanOperation).toHaveBeenCalledOnce();
  });

  it("records one inconclusive classic operation when prose cannot be normalized", async () => {
    mocks.reserveScanOperation.mockResolvedValueOnce({ replay: false, operation: { id: "classic-unverified-language", leaseToken: "lease", deviceId: "classic-language-device",
      kind: "text", aiUsed: false, isPremium: false, ordinal: 2, context: { timeZone: "Europe/Madrid", yearWeek: "2026-W44", resetAt: "2026-11-01T23:00:00Z" } } });
    mocks.translateWithDeepL.mockRejectedValueOnce(new Error("synthetic translation unavailable"));
    const response = await app.inject({ method: "POST", url: "/scan", headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "classic-language-device" },
      payload: { input: "Su cuenta ha sido bloqueada", outputLanguage: "es" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ category: "inconclusive", riskScore: null, classicCategory: "inconclusive", classicRiskScore: null, languageNormalizationUnavailable: true });
    expect(mocks.requestJson).not.toHaveBeenCalled();
    expect(mocks.completeScanOperation).toHaveBeenCalledOnce();
    expect(mocks.completeScanOperation.mock.calls[0][2]).toMatchObject({ finalCategory: "inconclusive", finalRiskScore: null, classicRiskScore: null, aiUsed: false, isThreat: false });
  });

  it("keeps positive classic evidence despite unavailable language normalization", async () => {
    mocks.reserveScanOperation.mockResolvedValueOnce({ replay: false, operation: { id: "classic-positive-language", leaseToken: "lease", deviceId: "classic-positive-device",
      kind: "text", aiUsed: false, isPremium: false, ordinal: 3, context: { timeZone: "Europe/Madrid", yearWeek: "2026-W44", resetAt: "2026-11-01T23:00:00Z" } } });
    mocks.translateWithDeepL.mockRejectedValueOnce(new Error("synthetic translation unavailable"));
    const response = await app.inject({ method: "POST", url: "/scan", headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "classic-positive-device" },
      payload: { input: "Consulte su cuenta http://192.168.1.10/login", outputLanguage: "es" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ category: "high_risk", languageNormalizationUnavailable: true });
    expect(response.json().riskScore).toBeGreaterThanOrEqual(70);
    expect(mocks.requestJson).not.toHaveBeenCalled();
  });

  it("does not translate URL-only classic input or add a language warning", async () => {
    mocks.reserveScanOperation.mockResolvedValueOnce({ replay: false, operation: { id: "classic-url-only", leaseToken: "lease", deviceId: "classic-url-device",
      kind: "text", aiUsed: false, isPremium: false, ordinal: 2, context: { timeZone: "Europe/Madrid", yearWeek: "2026-W44", resetAt: "2026-11-01T23:00:00Z" } } });
    const response = await app.inject({ method: "POST", url: "/scan", headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "classic-url-device" }, payload: { input: "https://example.com" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ category: "low_risk", riskScore: 0, languageNormalizationUnavailable: false });
    expect(mocks.translateWithDeepL).not.toHaveBeenCalled();
    expect(mocks.requestJson).not.toHaveBeenCalled();
  });

  it("does not downgrade a valid AI result when the auxiliary classic normalizer fails", async () => {
    mocks.translateWithDeepL.mockRejectedValueOnce(new Error("synthetic translation unavailable"));
    mocks.requestJson.mockResolvedValueOnce({ riskScore: 12, category: "low_risk", threatType: "none", reasons: [], explanation: "No clear scam signals in this test." });
    const response = await app.inject({ method: "POST", url: "/scan", headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "valid-ai-language-device" }, payload: { input: "Un boletÃ­n pÃºblico sintÃ©tico", outputLanguage: "es" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ category: "low_risk", riskScore: 12, languageNormalizationUnavailable: false });
    expect(mocks.requestJson).toHaveBeenCalledOnce();
  });

  it("replays a completed result without a new provider call or event", async () => {
    mocks.reserveScanOperation.mockResolvedValueOnce({ replay: true, statusCode: 200, response: { category: "high_risk", operationId: "same-op" } });
    const response = await app.inject({ method: "POST", url: "/scan", headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "replay-device", "idempotency-key": "same-key-001" }, payload: { input: "Synthetic sample" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().operationId).toBe("same-op");
    expect(mocks.requestJson).not.toHaveBeenCalled();
    expect(mocks.completeScanOperation).not.toHaveBeenCalled();
  });

  it.each([
    ["bg", "BG"], ["ca", "CA"], ["cs", "CS"], ["da", "DA"], ["de", "DE"],
    ["el", "EL"], ["en-GB", "EN-GB"], ["es", "ES"], ["et", "ET"], ["fi", "FI"],
    ["fr", "FR"], ["ga", "GA"], ["hr", "HR"], ["hu", "HU"], ["it", "IT"],
    ["lt", "LT"], ["lv", "LV"], ["mt", "MT"], ["nl", "NL"], ["pl", "PL"],
    ["pt", "PT-PT"], ["ro", "RO"], ["sk", "SK"], ["sl", "SL"], ["sv", "SV"],
  ])("routes completed text narrative to the requested app locale %s", async (locale, target) => {
    mocks.requestJson.mockResolvedValueOnce({ riskScore: 12, category: "low_risk", threatType: "none",
      reasons: ["Synthetic observation"], explanation: "Synthetic explanation." });
    mocks.translationBatch.mockImplementationOnce(async (request: { texts: string[]; targetLanguage: string }) =>
      request.texts.map((text) => `[${request.targetLanguage}] ${text}`));
    const response = await app.inject({ method: "POST", url: "/scan",
      headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "locale-test-device" },
      payload: { input: "Synthetic benign test message", outputLanguage: locale } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ riskScore: 12, category: "low_risk",
      reasons: [`[${target}] Synthetic observation`], aiExplanation: `[${target}] Synthetic explanation.` });
    expect(mocks.translationBatch).toHaveBeenCalledWith(expect.objectContaining({ targetLanguage: target }));
  });

  it("does not complete or charge a scan when configured narrative translation fails", async () => {
    mocks.translationBatch.mockRejectedValueOnce(new Error("synthetic translator unavailable"));
    const { boundary, body } = createMultipartVideoPayload();
    const response = await app.inject({ method: "POST", url: "/video-analysis",
      headers: { authorization: `Bearer ${"a".repeat(64)}`, "x-device-id": "translation-failure-device",
        "content-type": `multipart/form-data; boundary=${boundary}` }, payload: body });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "translation_unavailable" });
    expect(mocks.completeScanOperation).not.toHaveBeenCalled();
    expect(mocks.failScanOperation).toHaveBeenCalledOnce();
  });

  it("translates completed video analysis user-facing text to the requested language", async () => {
    mocks.requestJson.mockResolvedValueOnce({
      riskScore: 12,
      category: "low_risk",
      threatType: "none",
      contentContext: "educational_or_reporting",
      deceptiveSolicitation: false,
      financialInstitutionImpersonation: false,
      reasons: ["No clear scam indicators"],
      explanation: "No clear scam pattern was detected.",
    });

    mocks.translationBatch.mockResolvedValueOnce([
      "No se ha detectado un patrón claro de estafa.",
      "No hay indicadores claros de estafa",
    ]);

    const { boundary, body } = createMultipartVideoPayload();

    const response = await app.inject({
      method: "POST",
      url: "/video-analysis",
      headers: { authorization: `Bearer ${"a".repeat(64)}`,
        "x-device-id": "video-test-device-translation",
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(body.length),
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);

    expect(response.json().analysis).toEqual({
      riskScore: 12,
      category: "low_risk",
      threatType: "none",
      reasons: ["No hay indicadores claros de estafa"],
      explanation: "No se ha detectado un patrón claro de estafa.",
    });

    expect(mocks.translationBatch).toHaveBeenCalledTimes(1);
    expect(mocks.translationBatch).toHaveBeenCalledWith(expect.objectContaining({ targetLanguage: "ES" }));
    expect(mocks.translateWithDeepL).not.toHaveBeenCalled();

    expect(mocks.completeScanOperation).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ kind: "video" }), expect.objectContaining({ inputPreview: "[video]" }),
      expect.objectContaining({ analysis: response.json().analysis }), 3,
      expect.objectContaining({ result: expect.objectContaining({ analysis: response.json().analysis }) }),
      expect.any(Number),
    );
  });

  it("stores and returns completed forensic evidence", async () => {
    const { boundary, body, video } =
      createMultipartVideoPayload();

    const response = await app.inject({
      method: "POST",
      url: "/video-analysis",
      headers: { authorization: `Bearer ${"a".repeat(64)}`,
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
      transcription: {
        provider: "deepgram",
        hasSpeech: true,
        confidence: 0.98,
        languages: ["es"],
      },
      analysis: {
        riskScore: 12,
        category: "low_risk",
        threatType: "none",
        reasons: ["No clear scam indicators"],
        explanation: "No clear scam pattern was detected.",
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
    expect(mocks.transcribe).toHaveBeenCalledTimes(1);
    expect(mocks.extractVideoFrames).toHaveBeenCalledTimes(1);
    expect(mocks.requestJson).toHaveBeenCalledTimes(1);

    expect(mocks.requestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "conversation",
        media: [
          {
            dataBase64: "frame-one-base64",
            mimeType: "image/jpeg",
            filename: "video-frame-1.jpg",
          },
          {
            dataBase64: "frame-two-base64",
            mimeType: "image/jpeg",
            filename: "video-frame-2.jpg",
          },
        ],
      }),
    );

    expect(mocks.completeScanOperation).toHaveBeenCalledOnce();
    const completion = mocks.completeScanOperation.mock.calls[0];
    expect(completion[1]).toMatchObject({ deviceId: "video-test-device-001", kind: "video", aiUsed: true });
    expect(completion[2]).toMatchObject({ inputPreview: "[video]", finalCategory: "low_risk" });
    expect(completion[5]).toEqual({ providerSubmissionId: "hive-task-123", result: {
      forensics: payload.forensics, transcription: payload.transcription, hiddenContent: payload.hiddenContent, analysis: payload.analysis,
    } });

    expect(mocks.failMediaAnalysisJob).not.toHaveBeenCalled();
  });
});

describe("GET /video-analysis/:analysisId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.translationBatch.mockReset().mockImplementation(async (request: { texts: string[] }) => request.texts);
    mocks.hiddenContentAnalyze.mockResolvedValue({ version: 1, status: "bounded_partial_scan",
      zipStatus: "no_recognized_appended_zip", encryptedEntriesDeclared: 0,
      audioScan: "unsupported_or_lossy_audio", frameScan: "unsupported_or_lossy_pixels",
      subtitleScan: "no_subtitle_track", metadataScanned: true,
      audioPrefixSeconds: 0, frameTimestamps: [], candidates: [],
    });
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
      headers: { authorization: `Bearer ${"a".repeat(64)}`,
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

  it("returns structured transcription metadata without transcript text", async () => {
    const analysisId = "96d274c1-68e2-4812-8070-bfd156c2ef36";

    const forensics = {
      provider: "hive",
      aiGeneratedDetected: false,
      deepfakeDetected: false,
      maxAiGeneratedScore: 0.01,
      maxDeepfakeScore: 0,
      maxAiGeneratedAudioScore: null,
      topGenerator: null,
      suspiciousTimestamps: [],
    };

    const transcription = {
      provider: "deepgram",
      hasSpeech: true,
      confidence: 0.98,
      languages: ["es"],
    };

    const analysis = {
      riskScore: 12,
      category: "low_risk",
      threatType: "none",
      reasons: ["No clear scam indicators"],
      explanation: "No clear scam pattern was detected.",
    };

    mocks.getMediaAnalysisJob.mockResolvedValueOnce({
      id: analysisId,
      deviceId: "video-test-device-structured",
      provider: "hive",
      providerSubmissionId: "hive-task-structured-123",
      status: "completed",
      filename: "clip.mp4",
      mimeType: "video/mp4",
      sizeBytes: 1234,
      outputLanguage: "es",
      result: {
        forensics,
        transcription,
        analysis,
      },
      errorMessage: null,
      createdAt: new Date("2026-09-28T09:00:00.000Z"),
      updatedAt: new Date("2026-09-28T09:00:02.000Z"),
      completedAt: new Date("2026-09-28T09:00:02.000Z"),
    });

    const response = await app.inject({
      method: "GET",
      url: `/video-analysis/${analysisId}`,
      headers: { authorization: `Bearer ${"a".repeat(64)}`,
        "x-device-id": "video-test-device-structured",
      },
    });

    expect(response.statusCode).toBe(200);

    const payload = response.json();

    expect(payload).toEqual({
      analysisId,
      status: "completed",
      result: forensics,
      transcription,
      analysis,
      createdAt: "2026-09-28T09:00:00.000Z",
      updatedAt: "2026-09-28T09:00:02.000Z",
      completedAt: "2026-09-28T09:00:02.000Z",
    });

    expect(payload).not.toHaveProperty("transcript");
    expect(JSON.stringify(payload)).not.toContain(
      "Hola, esta es una prueba.",
    );
    expect(JSON.stringify(payload)).not.toContain(
      "frame-one-base64",
    );
  });

  it("returns a generic media analysis error for failed jobs", async () => {
    const analysisId = "08dcb9c5-4fbe-46c4-87bd-4da361f31320";

    mocks.getMediaAnalysisJob.mockResolvedValueOnce({
      id: analysisId,
      deviceId: "video-test-device-failed",
      provider: "hive",
      providerSubmissionId: "hive-task-failed-123",
      status: "failed",
      filename: "clip.mp4",
      mimeType: "video/mp4",
      sizeBytes: 1234,
      outputLanguage: "es",
      result: null,
      errorMessage: "External provider failed",
      createdAt: new Date("2026-09-28T09:00:00.000Z"),
      updatedAt: new Date("2026-09-28T09:00:02.000Z"),
      completedAt: new Date("2026-09-28T09:00:02.000Z"),
    });

    const response = await app.inject({
      method: "GET",
      url: `/video-analysis/${analysisId}`,
      headers: { authorization: `Bearer ${"a".repeat(64)}`,
        "x-device-id": "video-test-device-failed",
      },
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      analysisId,
      status: "failed",
      error: "media_analysis_failed",
      createdAt: "2026-09-28T09:00:00.000Z",
      updatedAt: "2026-09-28T09:00:02.000Z",
      completedAt: "2026-09-28T09:00:02.000Z",
    });
  });

  it("returns 404 when the analysis does not belong to the device", async () => {
    const analysisId = "8ec4f222-8ab7-47ac-8b56-514b37f76256";

    const response = await app.inject({
      method: "GET",
      url: `/video-analysis/${analysisId}`,
      headers: { authorization: `Bearer ${"a".repeat(64)}`,
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
