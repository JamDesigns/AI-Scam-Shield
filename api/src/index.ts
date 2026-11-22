import { analyzeMediaHiddenContent } from "./hidden-content/media-hidden-content.js";
import "dotenv/config";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { inferClassicThreatType } from "./threat-type.js";

import {
  createPool,
  getPremiumStatus,
  setPremiumStatus,
  getScanStats,
  getScanActivity,
  type InsertScanEventParams,
  createMediaAnalysisJob,
  markMediaAnalysisJobProcessing,
  completeMediaAnalysisJob,
  failMediaAnalysisJob,
  getMediaAnalysisJob,
} from "./db.js";
import { getDefaultRules, scoreInput } from "./rules.js";
import { translateWithDeepL } from "./translate.js";
import { createTranslationProvider } from "./translation/deepl-translation-provider.js";
import { TranslationService } from "./translation/translation-service.js";
import {
  analyzeImageAuthenticityWithAI,
  analyzeMediaWithAI,
  analyzeVideoWithAI,
  analyzeWithAI,
  type AiAnalysis,
  type ImageAuthenticityAnalysis,
  type MediaAnalysis,
  type ThreatType,
} from "./ai.js";
import { createAiProvider } from "./ai/ai-provider-factory.js";
import { createSelfHostedForensicsAnalyzer } from "./forensics/self-hosted-forensics.js";
import { createMediaForensicsProvider } from "./forensics/media-forensics-provider-factory.js";
import { buildMediaForensicsEvidence, type MediaForensicsEvidence } from "./forensics/media-forensics-evidence.js";
import { createMediaTranscriptionProvider } from "./transcription/media-transcription-provider-factory.js";
import { getVideoDurationSeconds, extractVideoFrames, MAX_VIDEO_DURATION_SECONDS } from "./video/video-frame-extractor.js";
import { runMigrations } from "./migrations.js";
import { ScanPolicyError, validateTimeZone, type ScanKind } from "./scan-policy.js";
import { getTimeContext, getUsageSnapshot, reserveScanOperation, completeScanOperation, failScanOperation, type ScanReservation } from "./scan-operations.js";
import { parseSupportedLocale } from "./locales.js";
import { withDeadline } from "./runtime-deadline.js";
import { authenticateDeviceSession, issueDeviceSession } from "./device-sessions.js";
import { consumeSharedRateLimit, enrollmentSubject, pruneRateLimits } from "./shared-rate-limit.js";
import { RevenueCatClient, readRevenueCatWebhook } from "./revenuecat-sync.js";
import { createRevenueCatWorker, enqueueSubscriptionSync, recordRevenueCatEvent } from "./revenuecat-jobs.js";
import { createAccountIdentityVerifier } from "./account-identity.js";
import { registerAccountRoutes } from "./account-routes.js";
import { getDeviceAccount } from "./premium-accounts.js";
import { readSubscriptionStatus, testAdminEnabled } from "./subscription-state.js";
import { InvalidAiAnalysisError } from "./ai/analysis-validation.js";
import { assessClassicResult, hasNaturalText } from "./classic-assessment.js";
import { qrContentsSchema } from "./scan-input-validation.js";
import { analysisProfileSchema } from "./analysis-profile.js";
import { createLocalForensicsAnalyzer, unavailableLocalEvidence } from "./local-forensics.js";
import { createLocalAnalyzer } from "./local-analysis.js";

declare module "fastify" {
  interface FastifyRequest { deviceSession: { deviceId: string; timeZone: string } | null }
}

function buildInputPreview(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 160);
}

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  ADMIN_TOKEN: z.string().default(""),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ALLOW_TEST_ADMIN: z.enum(["true", "false"]).default("false"),
  SESSION_RATE_LIMIT_SECRET: z.string().default(""),
  CORS_ORIGIN: z.string().default("*"),

  FREE_WEEKLY_LIMIT: z.coerce.number().int().refine((v) => v === 3, "Free plan requires three weekly scans").default(3),
  FREE_WEEKLY_AI_LIMIT: z.coerce.number().int().refine((v) => v === 1, "Free plan requires one weekly AI scan").default(1),

  ACCOUNT_IDENTITY_PROVIDER: z.enum(["disabled", "firebase"]).default("disabled"),
  FIREBASE_AUTH_PROJECT_ID: z.string().optional(),
  REVENUECAT_WEBHOOK_AUTH: z.string().default(""),
  REVENUECAT_API_KEY: z.string().default(""),
  REVENUECAT_ENVIRONMENT: z.enum(["PRODUCTION", "SANDBOX"]).default("PRODUCTION"),
  REVENUECAT_ENTITLEMENT_ID: z.string().min(1).default("scam_shield_pro"),

  TRANSLATION_PROVIDER: z.enum(["none", "deepl"]).optional(),
  DEEPL_MODEL_TYPE: z.enum(["latency_optimized", "quality_optimized"]).default("quality_optimized"),
  DEEPL_AUTH_KEY: z.string().optional(),
  DEEPL_API_BASE: z.string().default("https://api-free.deepl.com"),
  DEEPL_TARGET_LANG: z.string().default("EN"),

  AI_PROVIDER: z.string().min(1).default("ollama"),
  AI_MODE: z.string().min(1).default("local"),
  AI_BASE_URL: z.string().optional(),
  AI_MODEL: z.string().default("llava:latest"),
  AI_API_KEY: z.string().optional(),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).max(65536).default(4096),
  AI_SEND_TEMPERATURE: z.enum(["true", "false"]).default("true"),

  FORENSICS_PROVIDER: z.string().min(1).default("hive"),
  FORENSICS_BASE_URL: z.string().optional(),
  FORENSICS_MODEL: z
    .string()
    .default("hive/ai-generated-and-deepfake-content-detection"),
  FORENSICS_API_KEY: z.string().optional(),

  TRANSCRIPTION_PROVIDER: z.string().min(1).default("deepgram"),
  TRANSCRIPTION_BASE_URL: z.string().optional(),
  TRANSCRIPTION_MODEL: z.string().default("nova-3"),
  TRANSCRIPTION_API_KEY: z.string().optional(),
  TRANSCRIPTION_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).max(65536).default(4096),
  TRANSCRIPTION_SEND_TEMPERATURE: z.enum(["true", "false"]).default("true"),
});

const env = envSchema.parse({
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  NODE_ENV: process.env.NODE_ENV,
  ALLOW_TEST_ADMIN: process.env.ALLOW_TEST_ADMIN,
  SESSION_RATE_LIMIT_SECRET: process.env.SESSION_RATE_LIMIT_SECRET,
  CORS_ORIGIN: process.env.CORS_ORIGIN,

  FREE_WEEKLY_LIMIT: process.env.FREE_WEEKLY_LIMIT,
  FREE_WEEKLY_AI_LIMIT: process.env.FREE_WEEKLY_AI_LIMIT,

  ACCOUNT_IDENTITY_PROVIDER: process.env.ACCOUNT_IDENTITY_PROVIDER,
  FIREBASE_AUTH_PROJECT_ID: process.env.FIREBASE_AUTH_PROJECT_ID,
  REVENUECAT_WEBHOOK_AUTH: process.env.REVENUECAT_WEBHOOK_AUTH,
  REVENUECAT_API_KEY: process.env.REVENUECAT_API_KEY,
  REVENUECAT_ENVIRONMENT: process.env.REVENUECAT_ENVIRONMENT,
  REVENUECAT_ENTITLEMENT_ID: process.env.REVENUECAT_ENTITLEMENT_ID,

  TRANSLATION_PROVIDER: process.env.TRANSLATION_PROVIDER,
  DEEPL_MODEL_TYPE: process.env.DEEPL_MODEL_TYPE,
  DEEPL_AUTH_KEY: process.env.DEEPL_AUTH_KEY,
  DEEPL_API_BASE: process.env.DEEPL_API_BASE,
  DEEPL_TARGET_LANG: process.env.DEEPL_TARGET_LANG,

  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_MODE: process.env.AI_MODE,
  AI_BASE_URL: process.env.AI_BASE_URL,
  AI_MODEL: process.env.AI_MODEL,
  AI_API_KEY: process.env.AI_API_KEY,
  AI_MAX_OUTPUT_TOKENS: process.env.AI_MAX_OUTPUT_TOKENS,
  AI_SEND_TEMPERATURE: process.env.AI_SEND_TEMPERATURE,

  FORENSICS_PROVIDER: process.env.FORENSICS_PROVIDER,
  FORENSICS_BASE_URL: process.env.FORENSICS_BASE_URL,
  FORENSICS_MODEL: process.env.FORENSICS_MODEL,
  FORENSICS_API_KEY: process.env.FORENSICS_API_KEY,

  TRANSCRIPTION_PROVIDER: process.env.TRANSCRIPTION_PROVIDER,
  TRANSCRIPTION_BASE_URL: process.env.TRANSCRIPTION_BASE_URL,
  TRANSCRIPTION_MODEL: process.env.TRANSCRIPTION_MODEL,
  TRANSCRIPTION_API_KEY: process.env.TRANSCRIPTION_API_KEY,
  TRANSCRIPTION_MAX_OUTPUT_TOKENS: process.env.TRANSCRIPTION_MAX_OUTPUT_TOKENS,
  TRANSCRIPTION_SEND_TEMPERATURE: process.env.TRANSCRIPTION_SEND_TEMPERATURE,
});

const analysisProfile = analysisProfileSchema.parse(process.env);
const localAnalyzer = analysisProfile.mode === "local"
  ? createLocalAnalyzer({ baseUrl: analysisProfile.baseUrl, model: analysisProfile.model,
      speechBaseUrl: analysisProfile.forensicsBaseUrl ?? "http://host.docker.internal:8081" })
  : null;
// Preserve existing configured DeepL installations; an explicit "none" disables it.
const translationProviderName = env.TRANSLATION_PROVIDER ?? (env.DEEPL_AUTH_KEY?.trim() ? "deepl" : "none");
const translationProvider = createTranslationProvider({
  profile: analysisProfile.mode,
  provider: translationProviderName,
  deepl: { authKey: env.DEEPL_AUTH_KEY ?? "", apiBase: env.DEEPL_API_BASE, modelType: env.DEEPL_MODEL_TYPE },
});
const translationService = new TranslationService(translationProvider);
const deeplAuthKey = translationProvider ? env.DEEPL_AUTH_KEY : undefined;
const localForensicsAnalyzer = analysisProfile.mode === "local" && analysisProfile.forensicsBaseUrl
  ? createLocalForensicsAnalyzer({ baseUrl: analysisProfile.forensicsBaseUrl }) : null;

const aiProvider = localAnalyzer ? localAnalyzer.provider : createAiProvider({
  provider: env.AI_PROVIDER,
  mode: env.AI_MODE,
  baseUrl: env.AI_BASE_URL,
  model: env.AI_MODEL,
  apiKey: env.AI_API_KEY,
  maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
  sendTemperature: env.AI_SEND_TEMPERATURE === "true",
});

const selfHostedForensics = !localAnalyzer && env.FORENSICS_PROVIDER.trim().toLowerCase() === "self-hosted"
  ? createSelfHostedForensicsAnalyzer(env.FORENSICS_BASE_URL ?? "") : null;
const mediaForensicsProvider = localAnalyzer || selfHostedForensics ? null : createMediaForensicsProvider({
  provider: env.FORENSICS_PROVIDER,
  baseUrl: env.FORENSICS_BASE_URL,
  model: env.FORENSICS_MODEL,
  apiKey: env.FORENSICS_API_KEY,
});

const mediaTranscriptionProvider = localAnalyzer ? null : createMediaTranscriptionProvider({
  provider: env.TRANSCRIPTION_PROVIDER,
  baseUrl: env.TRANSCRIPTION_BASE_URL,
  model: env.TRANSCRIPTION_MODEL,
  apiKey: env.TRANSCRIPTION_API_KEY,
  maxOutputTokens: env.TRANSCRIPTION_MAX_OUTPUT_TOKENS,
  sendTemperature: env.TRANSCRIPTION_SEND_TEMPERATURE === "true",
});

const app = Fastify({
  logger: { redact: ["req.headers.authorization", "req.headers.x-admin-token", "req.headers.x-account-authorization"],
    serializers: { req: (req: { method?: string; url?: string }) => ({ method: req.method, url: req.url?.split("?")[0] }) } },
  trustProxy: false,
  bodyLimit: 10 * 1024 * 1024,
});

await app.register(cors, {
  origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
});

await app.register(multipart);

const pool = createPool(env.DATABASE_URL);

await runMigrations(pool);

const revenueCatConfigured = env.REVENUECAT_API_KEY.trim().length > 0;
const revenueCatClient = new RevenueCatClient({ apiKey: env.REVENUECAT_API_KEY,
  environment: env.REVENUECAT_ENVIRONMENT, entitlementId: env.REVENUECAT_ENTITLEMENT_ID });
const revenueCatWorker = createRevenueCatWorker(pool, revenueCatClient, {
  onError: (code) => app.log.warn({ code }, "Subscription synchronization pending"),
});
let subscriptionTimer: ReturnType<typeof setInterval> | undefined;
let rateCleanupTimer: ReturnType<typeof setInterval> | undefined;
app.addHook("onReady", async () => {
  if (env.NODE_ENV === "test") return;
  if (revenueCatConfigured) {
    subscriptionTimer = setInterval(() => { void revenueCatWorker.tick(); }, 3000);
    subscriptionTimer.unref();
    void revenueCatWorker.tick();
  }
  rateCleanupTimer = setInterval(() => { void pruneRateLimits(pool).catch(() => app.log.warn("Rate limit cleanup pending")); }, 15 * 60 * 1000);
  rateCleanupTimer.unref();
  void pruneRateLimits(pool).catch(() => app.log.warn("Rate limit cleanup pending"));
});
app.addHook("onClose", async () => {
  if (subscriptionTimer) clearInterval(subscriptionTimer);
  if (rateCleanupTimer) clearInterval(rateCleanupTimer);
  await revenueCatWorker.stop();
  await pool.end?.();
});

function sameSecret(value: unknown, expected: string): boolean {
  if (typeof value !== "string" || expected.length < 8) return false;
  const actual = Buffer.from(value), secret = Buffer.from(expected);
  return actual.length === secret.length && timingSafeEqual(actual, secret);
}

app.decorateRequest("deviceSession", null);
app.addHook("onRequest", async (req) => {
  const route = req.routeOptions.url;
  if (req.method === "OPTIONS" || (req.method === "GET" || req.method === "HEAD") && (route === "/health" || route === "/rules")) return;
  if (req.method === "POST" && route === "/sessions") {
    if (env.SESSION_RATE_LIMIT_SECRET.length < 32 || env.NODE_ENV === "production" && /^(replace|example|change)/i.test(env.SESSION_RATE_LIMIT_SECRET)) {
      throw new ScanPolicyError("session_enrollment_unavailable", 503);
    }
    // Fastify trustProxy is explicitly false: a caller's X-Forwarded-For cannot select its counter.
    const limit = await consumeSharedRateLimit(pool, { scope: "session_enrollment", subjectHash: enrollmentSubject(req.ip, env.SESSION_RATE_LIMIT_SECRET), limit: 5, windowSeconds: 3600 });
    if (!limit.allowed) throw new ScanPolicyError("enrollment_rate_limited", 429, { retryAfterSeconds: limit.retryAfterSeconds });
    return;
  }
  if (req.method === "POST" && route === "/webhooks/revenuecat") {
    if (env.REVENUECAT_WEBHOOK_AUTH.length < 8) throw new ScanPolicyError("subscription_webhook_unavailable", 503);
    if (!sameSecret(req.headers.authorization, env.REVENUECAT_WEBHOOK_AUTH)) throw new ScanPolicyError("unauthorized", 401);
    return;
  }
  if (req.method === "POST" && route === "/admin/subscriptions/set") {
    if (!testAdminEnabled()) throw new ScanPolicyError("not_found", 404);
    if (!sameSecret(req.headers["x-admin-token"], env.ADMIN_TOKEN)) throw new ScanPolicyError("unauthorized", 401);
    return;
  }
  const session = await authenticateDeviceSession(pool, { deviceId: req.headers["x-device-id"], authorization: req.headers.authorization });
  if (!session) throw new ScanPolicyError("session_invalid", 401);
  req.deviceSession = session;
  if (req.headers["x-time-zone"] !== undefined && validateTimeZone(req.headers["x-time-zone"]) !== session.timeZone) {
    throw new ScanPolicyError("time_zone_mismatch", 409, { timeZone: session.timeZone });
  }
});

registerAccountRoutes(app, {
  pool,
  verifier: createAccountIdentityVerifier({ provider: env.ACCOUNT_IDENTITY_PROVIDER, firebaseProjectId: env.FIREBASE_AUTH_PROJECT_ID }),
  revenueCatClient,
  requireDevice,
});

app.post("/sessions", async (req, reply) => {
  const body = z.object({ timeZone: z.string().min(1).max(100) }).strict().parse(req.body);
  const session = await issueDeviceSession(pool, validateTimeZone(body.timeZone));
  return reply.code(201).send(session);
});

app.get("/health", async () => {
  return { ok: true, ts: new Date().toISOString() };
});

app.get("/rules", async () => {
  return getDefaultRules();
});

app.get("/subscriptions/status", async (req) => ({
  ...await readSubscriptionStatus(pool, requireDevice(req), env.REVENUECAT_ENVIRONMENT), syncAvailable: revenueCatConfigured,
}));

app.post("/subscriptions/sync", async (req, reply) => {
  z.object({}).strict().default({}).parse(req.body);
  const deviceId = requireDevice(req);
  if (!revenueCatConfigured) throw new ScanPolicyError("subscription_sync_unavailable", 503);
  const limit = await consumeSharedRateLimit(pool, { scope: "subscription_sync", subjectHash: createHash("sha256").update(deviceId).digest("hex"), limit: 1, windowSeconds: 30 });
  if (!limit.allowed) throw new ScanPolicyError("subscription_sync_rate_limited", 429, { retryAfterSeconds: limit.retryAfterSeconds });
  await enqueueSubscriptionSync(pool, [deviceId]);
  return reply.code(202).send({ status: "queued", retryAfterSeconds: 3 });
});

function requireDevice(req: FastifyRequest): string {
  if (!req.deviceSession) throw new ScanPolicyError("session_invalid", 401);
  return req.deviceSession.deviceId;
}

function requestTimeZone(req: FastifyRequest): string {
  if (!req.deviceSession) throw new ScanPolicyError("session_invalid", 401);
  return req.deviceSession.timeZone;
}

const outputLanguageSchema = z.string().min(2).max(16).default("en-GB").transform((value, context) => {
  const language = parseSupportedLocale(value);
  if (language === null) { context.addIssue({ code: z.ZodIssueCode.custom, message: "unsupported_output_language" }); return z.NEVER; }
  return language;
});

async function providerCall<T>(run: (signal: AbortSignal) => Promise<T>, code = "ai_unavailable", signal?: AbortSignal): Promise<T> {
  const cleanup = new AbortController();
  try { return await withDeadline((deadlineSignal) => run(AbortSignal.any([deadlineSignal, cleanup.signal])), { signal, timeoutMs: 90_000 }, code); }
  catch (error) {
    if (signal?.aborted) throw new ScanPolicyError("operation_timeout", 503);
    if (error instanceof InvalidAiAnalysisError) throw new ScanPolicyError("invalid_ai_analysis", 503);
    throw new ScanPolicyError(code, 503);
  }
  finally { cleanup.abort(); }
}

type ScanOutcome = { response: Record<string, unknown>; event: Omit<InsertScanEventParams, "id" | "deviceId">;
  mediaJob?: { providerSubmissionId?: string; result: unknown } };

async function executeScan(req: FastifyRequest, reply: FastifyReply, kind: ScanKind, requestHash: string,
  perform: (operation: ScanReservation, signal: AbortSignal) => Promise<ScanOutcome>, deadlineAt = Date.now() + 90_000) {
  const deviceId = requireDevice(req);
  const timeZone = requestTimeZone(req);
  const suppliedKey = req.headers["idempotency-key"];
  if (suppliedKey !== undefined && (typeof suppliedKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(suppliedKey))) {
    throw new ScanPolicyError("invalid_idempotency_key", 400);
  }
  const idempotencyKey = suppliedKey ?? randomUUID();
  reply.header("idempotency-key", idempotencyKey);
  const reservation = await reserveScanOperation(pool, { deviceId, idempotencyKey, requestHash, kind, timeZone, weeklyLimit: env.FREE_WEEKLY_LIMIT });
  if (reservation.replay) return reply.code(reservation.statusCode).send(reservation.response);
  const cleanup = new AbortController();
  try {
    if (Date.now() >= deadlineAt) throw new ScanPolicyError("operation_timeout", 503);
    const outcome = await withDeadline((signal) => perform(reservation.operation, AbortSignal.any([signal, cleanup.signal])), { timeoutMs: deadlineAt - Date.now() }, "Scan operation");
    if (Date.now() >= deadlineAt) throw new ScanPolicyError("operation_timeout", 503);
    return await completeScanOperation(pool, reservation.operation, outcome.event, outcome.response, env.FREE_WEEKLY_LIMIT, outcome.mediaJob, deadlineAt);
  } catch (error) {
    cleanup.abort();
    try { await withDeadline(() => failScanOperation(pool, reservation.operation), { timeoutMs: 3000 }, "Release scan reservation"); }
    catch (releaseError) { req.log.error({ err: releaseError, operationId: reservation.operation.id }, "Failed to release scan reservation"); }
    if (!(error instanceof ScanPolicyError) && error instanceof Error && /Scan operation.*(timed out|aborted)/.test(error.message)) throw new ScanPolicyError("operation_timeout", 503);
    throw error;
  } finally { cleanup.abort(); }
}

const requestDigest = (kind: ScanKind, value: unknown) => createHash("sha256").update(kind).update(JSON.stringify(value)).digest("hex");

function eventForAnalysis(inputPreview: string, analysis: AiAnalysis, aiUsed: boolean, classic = analysis): ScanOutcome["event"] {
  return { inputPreview, finalCategory: analysis.category, threatType: analysis.threatType, finalRiskScore: analysis.riskScore,
    classicCategory: classic.category, classicRiskScore: classic.riskScore, aiUsed, isThreat: analysis.category === "medium_risk" || analysis.category === "high_risk" };
}

app.get("/usage/week", async (req) => {
  const deviceId = requireDevice(req);
  const account = await getDeviceAccount(pool, deviceId);
  const context = await getTimeContext(pool, account?.timeZone ?? requestTimeZone(req));
  return getUsageSnapshot(pool, deviceId, context, env.FREE_WEEKLY_LIMIT);
});

app.get("/stats", async (req) => {
  const deviceId = requireDevice(req);
  const account = await getDeviceAccount(pool, deviceId);
  const timeZone = account?.timeZone ?? requestTimeZone(req);
  const query = z.object({ period: z.enum(["today", "week", "month", "year"]).default("month") }).parse(req.query);
  const stats = await getScanStats(pool, deviceId, timeZone, query.period);
  const context = await getTimeContext(pool, timeZone);
  return { ...stats, ...await getUsageSnapshot(pool, deviceId, context, env.FREE_WEEKLY_LIMIT) };
});

app.get("/activity", async (req, reply) => {
  const deviceId = req.headers["x-device-id"];

  if (typeof deviceId !== "string" || deviceId.length === 0) {
    return reply.code(400).send({ error: "missing_device_id" });
  }

  const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  });

  const query = querySchema.parse(req.query);
  const items = await getScanActivity(pool, deviceId, query.page, query.limit);

  return {
    page: query.page,
    limit: query.limit,
    items,
  };
});

app.post("/scan", async (req, reply) => {
  const body = z.object({ input: z.string().trim().min(1).max(1500), outputLanguage: outputLanguageSchema }).parse(req.body);
  return executeScan(req, reply, "text", requestDigest("text", body), async (operation, operationSignal) => {
    if (operation.aiUsed && !aiProvider) throw new ScanPolicyError("ai_unavailable", 503);
    let textForScoring = body.input;
    let languageNormalizationUnavailable = false;
    const needsNormalization = hasNaturalText(body.input);
    if (needsNormalization && deeplAuthKey?.trim()) {
      try {
        textForScoring = (await providerCall((signal) => translateWithDeepL({ text: body.input, authKey: deeplAuthKey, apiBase: env.DEEPL_API_BASE, targetLang: "EN", signal }), "translation_unavailable", operationSignal)).text;
      } catch { languageNormalizationUnavailable = true; }
    } else if (needsNormalization) { languageNormalizationUnavailable = true; }
    const classicScore = scoreInput(textForScoring, getDefaultRules(), body.input);
    const classic: AiAnalysis = { ...classicScore, category: classicScore.category as AiAnalysis["category"],
      threatType: inferClassicThreatType(textForScoring, classicScore.category), explanation: "" };
    if (!operation.aiUsed) {
      const assessment = assessClassicResult({ input: body.input,
        score: { ...classicScore, category: classic.category }, normalizationUnavailable: languageNormalizationUnavailable });
      const threatType = assessment.category === "inconclusive" ? "none" : classic.threatType;
      return { event: { inputPreview: buildInputPreview(body.input), finalCategory: assessment.category,
        finalRiskScore: assessment.riskScore, threatType, classicCategory: assessment.category, classicRiskScore: assessment.riskScore,
        aiUsed: false, isThreat: assessment.category === "medium_risk" || assessment.category === "high_risk" },
        response: { riskScore: assessment.riskScore, category: assessment.category, threatType, reasons: assessment.reasons,
          classicRiskScore: assessment.riskScore, classicCategory: assessment.category, classicReasons: assessment.reasons,
          aiExplanation: null, languageNormalizationUnavailable: assessment.languageNormalizationUnavailable } };
    }
    let analysis = await providerCall((signal) => analyzeWithAI({ provider: aiProvider!, input: body.input, outputLanguage: body.outputLanguage, signal }), "ai_unavailable", operationSignal);
    analysis = await providerCall((signal) => translationService.analysis(analysis, body.outputLanguage, signal), "translation_unavailable", operationSignal);
    return { event: eventForAnalysis(buildInputPreview(body.input), analysis, operation.aiUsed, classic), response: {
      riskScore: analysis.riskScore, category: analysis.category, threatType: analysis.threatType, reasons: analysis.reasons,
      classicRiskScore: classic.riskScore, classicCategory: classic.category, classicReasons: classic.reasons,
      aiExplanation: analysis.explanation, languageNormalizationUnavailable: false,
    } };
  });
});

const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;
const SUPPORTED_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/x-m4v", "video/m4v", "video/quicktime", "video/x-matroska"]);

app.post("/video-analysis", async (req, reply) => {
  requireDevice(req);
  requestTimeZone(req);
  if (!req.isMultipart()) throw new ScanPolicyError("multipart_required", 415);
  let analysisId: string | undefined;
  try {
    const upload = await req.saveRequestFiles({ limits: { fileSize: MAX_VIDEO_UPLOAD_BYTES, files: 1, fields: 2, parts: 3, fieldSize: 6000 } });
    // Exclude upload, but include metadata probing, hashing and every provider in one budget.
    const videoDeadlineAt = Date.now() + 90_000;
    if (upload.files.length !== 1) throw new ScanPolicyError("video_required", 400);
    const file = upload.files[0];
    if (file.fieldname !== "media") throw new ScanPolicyError("invalid_file_field", 400, { expected: "media" });
    const mimeType = file.mimetype.toLowerCase();
    if (!SUPPORTED_VIDEO_MIME_TYPES.has(mimeType)) throw new ScanPolicyError("unsupported_media_type", 415);
    const sizeBytes = (await stat(file.filepath)).size;
    if (sizeBytes <= 0 || sizeBytes > MAX_VIDEO_UPLOAD_BYTES) throw new ScanPolicyError("video_too_large", 413, { maxBytes: MAX_VIDEO_UPLOAD_BYTES });
    const values = upload.values as Record<string, unknown>;
    const field = (name: string) => { const value = values[name]; return value && typeof value === "object" && "value" in value ? value.value : value; };
    const outputLanguage = outputLanguageSchema.parse(field("outputLanguage"));
    const contextText = z.string().max(1500).default("").parse(field("contextText"));
    let durationSeconds: number;
    try { durationSeconds = await getVideoDurationSeconds(file.filepath, { timeoutMs: Math.min(10_000, Math.max(1, videoDeadlineAt - Date.now())) }); }
    catch { if (Date.now() >= videoDeadlineAt) throw new ScanPolicyError("operation_timeout", 503); throw new ScanPolicyError("invalid_video", 400); }
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new ScanPolicyError("invalid_video", 400);
    if (durationSeconds > MAX_VIDEO_DURATION_SECONDS) throw new ScanPolicyError("video_too_long", 400, { maxDurationSeconds: MAX_VIDEO_DURATION_SECONDS });
    let digest: string;
    try {
      digest = await withDeadline(async (signal) => {
        const hash = createHash("sha256").update(JSON.stringify({ mimeType, outputLanguage, contextText }));
        for await (const chunk of createReadStream(file.filepath, { signal })) hash.update(chunk);
        return hash.digest("hex");
      }, { timeoutMs: Math.max(1, videoDeadlineAt - Date.now()) }, "Video input processing");
    } catch { throw new ScanPolicyError("operation_timeout", 503); }
    return await executeScan(req, reply, "video", digest, async (operation, operationSignal) => {
      const hiddenContent = await analyzeMediaHiddenContent({ filePath: file.filepath, durationSeconds, signal: operationSignal });
      if (localAnalyzer) {
        analysisId = operation.id;
        await createMediaAnalysisJob(pool, { id: analysisId, deviceId: operation.deviceId, provider: localAnalyzer.provider.name,
          filename: file.filename, mimeType, sizeBytes, outputLanguage });
        const localTranscription = await providerCall((signal) => localAnalyzer.transcribeVideo({
          filePath: file.filepath, durationSeconds, signal,
        }), "transcription_unavailable", operationSignal);
        const { transcript, languages } = localTranscription;
        const transcription = { provider: localAnalyzer.provider.name,
          hasSpeech: localTranscription.speechDetected ?? transcript.trim().length > 0,
          transcriptionStatus: localTranscription.transcriptionStatus, languages };
        const frames = await providerCall((signal) => extractVideoFrames({ filePath: file.filepath, durationSeconds, signal }), "video_processing_failed", operationSignal);
        const evidence = localForensicsAnalyzer
          ? await providerCall((signal) => localForensicsAnalyzer.analyze({ filePath: file.filepath, durationSeconds, frames, signal }), "forensics_unavailable", operationSignal)
          : unavailableLocalEvidence();
        const analysis = await providerCall((signal) => analyzeVideoWithAI({ provider: localAnalyzer.provider, transcript, frames,
          forensics: evidence, hiddenContent, outputLanguage, contextText, signal }), "ai_unavailable", operationSignal);
        const result = { forensics: evidence, transcription, hiddenContent, analysis };
        return { event: eventForAnalysis("[video]", analysis, true), mediaJob: { result },
          response: { analysisId, status: "completed", ...result, durationSeconds } };
      }
      if (!mediaForensicsProvider && !selfHostedForensics) throw new ScanPolicyError("forensics_unavailable", 503);
      if (!mediaTranscriptionProvider) throw new ScanPolicyError("transcription_unavailable", 503);
      if (!aiProvider) throw new ScanPolicyError("ai_unavailable", 503);
      analysisId = operation.id;
      await createMediaAnalysisJob(pool, { id: analysisId, deviceId: operation.deviceId, provider: selfHostedForensics?.name ?? mediaForensicsProvider!.name,
        filename: file.filename, mimeType, sizeBytes, outputLanguage });
      // Internal trusted paths/probed durations are never accepted from the client body.
      const input = { filename: file.filename, mimeType, sizeBytes, filePath: file.filepath, durationSeconds,
        createReadStream: () => createReadStream(file.filepath) };
      const selfHostedFrames = selfHostedForensics
        ? await providerCall((signal) => extractVideoFrames({ filePath: file.filepath, durationSeconds, signal }), "video_processing_failed", operationSignal)
        : undefined;
      const providerResult = selfHostedForensics ? null : await providerCall((signal) => mediaForensicsProvider!.analyze({ ...input, signal }), "forensics_unavailable", operationSignal);
      if (providerResult && providerResult.status !== "completed") throw new ScanPolicyError(providerResult.status === "failed" ? "forensics_failed" : "forensics_pending", 503);
      const evidence = selfHostedForensics
        ? await providerCall((signal) => selfHostedForensics.analyze({ filePath: file.filepath, durationSeconds, frames: selfHostedFrames!, signal }), "forensics_unavailable", operationSignal)
        : buildMediaForensicsEvidence({ provider: mediaForensicsProvider!.name, mimeType, result: providerResult! });
      const transcriptionResult = await providerCall((signal) => mediaTranscriptionProvider.transcribe({ ...input, signal }), "transcription_unavailable", operationSignal);
      const transcription = { provider: mediaTranscriptionProvider.name, hasSpeech: transcriptionResult.transcript.trim().length > 0,
        ...(transcriptionResult.transcriptionStatus ? { transcriptionStatus: transcriptionResult.transcriptionStatus } : {}),
        ...(typeof transcriptionResult.confidence === "number" ? { confidence: transcriptionResult.confidence } : {}), languages: transcriptionResult.languages };
      const frames = selfHostedFrames ?? await providerCall((signal) => extractVideoFrames({ filePath: file.filepath, durationSeconds, signal }), "video_processing_failed", operationSignal);
      let analysis = await providerCall((signal) => analyzeVideoWithAI({ provider: aiProvider, transcript: transcriptionResult.transcript, frames,
        forensics: evidence, hiddenContent, outputLanguage, contextText, signal }), "ai_unavailable", operationSignal);
      analysis = await providerCall((signal) => translationService.analysis(analysis, outputLanguage, signal), "translation_unavailable", operationSignal);
      return { event: eventForAnalysis("[video]", analysis, true),
        mediaJob: { providerSubmissionId: providerResult?.submissionId, result: { forensics: evidence, transcription, hiddenContent, analysis } },
        response: { analysisId, status: "completed", forensics: evidence, transcription, hiddenContent, analysis, durationSeconds } };
    }, videoDeadlineAt);
  } catch (error) {
    if (analysisId) {
      try { await failMediaAnalysisJob(pool, { id: analysisId, deviceId: requireDevice(req), errorMessage: error instanceof ScanPolicyError ? error.code : "video_analysis_failed" }); }
      catch { req.log.error({ analysisId }, "Failed to mark video job failed"); }
    }
    if (error instanceof app.multipartErrors.RequestFileTooLargeError) throw new ScanPolicyError("video_too_large", 413, { maxBytes: MAX_VIDEO_UPLOAD_BYTES });
    throw error;
  }
});

app.get("/video-analysis/:analysisId", async (req, reply) => {
  const deviceId = req.headers["x-device-id"];

  if (typeof deviceId !== "string" || deviceId.length === 0) {
    return reply.code(400).send({
      error: "missing_device_id",
    });
  }

  const paramsSchema = z.object({
    analysisId: z.string().uuid(),
  });

  const parsedParams = paramsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return reply.code(400).send({
      error: "invalid_analysis_id",
    });
  }

  const job = await getMediaAnalysisJob(
    pool,
    parsedParams.data.analysisId,
    deviceId,
  );

  if (!job) {
    return reply.code(404).send({
      error: "analysis_not_found",
    });
  }

  if (job.status === "completed") {
    const storedResult =
      job.result &&
      typeof job.result === "object" &&
      !Array.isArray(job.result)
        ? (job.result as Record<string, unknown>)
        : null;

    const hasStructuredResult =
      storedResult !== null &&
      "forensics" in storedResult;

    return {
      analysisId: job.id,
      status: job.status,
      result: hasStructuredResult
        ? storedResult.forensics
        : job.result,
      ...(hasStructuredResult &&
      "transcription" in storedResult
        ? { transcription: storedResult.transcription }
        : {}),
      ...(hasStructuredResult &&
      "analysis" in storedResult
        ? { analysis: storedResult.analysis }
        : {}),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    };
  }

  if (job.status === "failed") {
    return {
      analysisId: job.id,
      status: job.status,
      error: "media_analysis_failed",
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    };
  }

  return {
    analysisId: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
});

app.post("/media-analysis", async (req, reply) => {
  const body = z.object({ imageBase64: z.string().min(1).max(8_000_000), extractedText: z.string().max(5000).default(""),
    mediaSignals: z.string().max(5000).default(""), contextText: z.string().max(1500).default(""),
    qrContents: qrContentsSchema,
    hiddenContent: z.object({ source: z.literal("client_report"),
      encryptedEntriesDeclared: z.number().int().min(0).max(8) }).strict().optional(),
    imageForensics: z.object({ rawLogit: z.number(), threshold: z.number(), isAiGenerated: z.boolean() }).optional(),
    outputLanguage: outputLanguageSchema }).parse(req.body);
  return executeScan(req, reply, "image", requestDigest("image", body), async (operation, operationSignal) => {
    if (!aiProvider) throw new ScanPolicyError("ai_unavailable", 503);
    let analysis = await providerCall((signal) => analyzeMediaWithAI({ provider: aiProvider, ...body, signal }), "ai_unavailable", operationSignal);
    analysis = await providerCall((signal) => translationService.analysis(analysis, body.outputLanguage, signal), "translation_unavailable", operationSignal);
    if ((analysis.fraudAssessment as string) === "inconclusive") return { response: { ...analysis, riskScore: null, category: "inconclusive", threatType: "none" },
      event: { inputPreview: "[image]", finalCategory: "inconclusive", finalRiskScore: null, threatType: "none", classicCategory: "inconclusive", classicRiskScore: null, aiUsed: true, isThreat: false } };
    const high = analysis.fraudAssessment === "strong_fraud_signals";
    const medium = analysis.fraudAssessment === "possible_fraud";
    const risk: AiAnalysis = { category: high ? "high_risk" : medium ? "medium_risk" : "low_risk", riskScore: high ? 85 : medium ? 50 : 15,
      threatType: high || medium ? "unknown_suspicious" : "none", reasons: analysis.fraudReasons, explanation: analysis.explanation };
    return { event: eventForAnalysis("[image]", risk, true), response: { ...analysis, riskScore: risk.riskScore, category: risk.category, threatType: risk.threatType } };
  });
});

app.post("/image-authenticity", async (req, reply) => {
  const body = z.object({ imageSignals: z.string().min(1).max(3000), imageBase64: z.string().min(1).max(4_000_000),
    outputLanguage: outputLanguageSchema }).parse(req.body);
  return executeScan(req, reply, "image_authenticity", requestDigest("image_authenticity", body), async (operation, operationSignal) => {
    if (!aiProvider) throw new ScanPolicyError("ai_unavailable", 503);
    let analysis = await providerCall((signal) => analyzeImageAuthenticityWithAI({ provider: aiProvider, ...body, signal }), "ai_unavailable", operationSignal);
    analysis = await providerCall((signal) => translationService.analysis(analysis, body.outputLanguage, signal), "translation_unavailable", operationSignal);
    // Authenticity alone does not establish fraud risk. Preserve this as an explicitly unassessed category.
    return { response: { ...analysis }, event: { inputPreview: "[image authenticity]", finalCategory: "inconclusive", finalRiskScore: null,
      threatType: "none", classicCategory: "inconclusive", classicRiskScore: null, aiUsed: true, isThreat: false } };
  });
});

app.post("/admin/subscriptions/set", async (req) => {
  const body = z.object({ deviceId: z.string().uuid(), isPremium: z.boolean() }).strict().parse(req.body);
  const changed = await setPremiumStatus(pool, body.deviceId, body.isPremium);
  if (!changed) throw new ScanPolicyError("session_not_found", 404);
  return { ok: true, source: "test_admin" };
});

app.post("/webhooks/revenuecat", async (req) => {
  let event;
  try { event = readRevenueCatWebhook(req.body); }
  catch { throw new ScanPolicyError("invalid_webhook", 400); }
  const result = await recordRevenueCatEvent(pool, event, env.REVENUECAT_ENVIRONMENT);
  return { ok: true, accepted: true, ...result };
});

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ScanPolicyError) {
    if (err.statusCode === 429 && typeof err.details.retryAfterSeconds === "number") reply.header("retry-after", String(err.details.retryAfterSeconds));
    return reply.code(err.statusCode).send({ error: err.code, ...err.details });
  }
  if (err instanceof z.ZodError) return reply.code(400).send({ error: "invalid_request" });
  app.log.error(err);
  const status = (err as { statusCode?: number })?.statusCode ?? 500;
  reply.code(status).send({ error: "server_error" });
});

export { app };

if (process.env.NODE_ENV !== "test") {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}
