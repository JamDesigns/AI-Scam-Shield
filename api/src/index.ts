import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { inferClassicThreatType } from "./threat-type.js";

import {
  createPool,
  ensureDevice,
  getPremiumStatus,
  setPremiumStatus,
  getWeeklyUsage,
  incrementWeeklyUsage,
  getWeeklyAiUsage,
  incrementWeeklyAiUsage,
  insertScanEvent,
  getScanStats,
  getScanActivity,
} from "./db.js";
import { getDefaultRules, scoreInput } from "./rules.js";
import { translateWithDeepL } from "./translate.js";
import {
  analyzeImageAuthenticityWithAI,
  analyzeMediaWithAI,
  analyzeWithAI,
  type AiAnalysis,
  type ImageAuthenticityAnalysis,
  type MediaAnalysis,
  type ThreatType,
} from "./ai.js";

function getIsoWeekKey(date: Date): { yearWeek: string; resetAt: string } {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  const year = d.getUTCFullYear();

  const yearWeek = `${year}-W${String(weekNo).padStart(2, "0")}`;

  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const endDay = end.getUTCDay() || 7;
  end.setUTCDate(end.getUTCDate() + (7 - endDay));
  end.setUTCHours(23, 59, 59, 999);

  return { yearWeek, resetAt: end.toISOString() };
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function createEventId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

function buildInputPreview(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 160);
}

function getDeepLTargetLanguage(language: string): string | null {
  const value = language.trim().toLowerCase();

  if (value === "es") return "ES";
  if (value === "fr") return "FR";
  if (value === "de") return "DE";
  if (value === "it") return "IT";

  return null;
}

async function translateImageAuthenticityAnalysis(params: {
  analysis: ImageAuthenticityAnalysis;
  outputLanguage: string;
  authKey?: string;
  apiBase: string;
}): Promise<ImageAuthenticityAnalysis> {
  const targetLang = getDeepLTargetLanguage(params.outputLanguage);

  if (!targetLang || !params.authKey || params.authKey.trim().length === 0) {
    return params.analysis;
  }

  const [reasonsTranslation, explanationTranslation, disclaimerTranslation] =
    await Promise.all([
      translateWithDeepL({
        text: params.analysis.reasons.join("\n"),
        authKey: params.authKey,
        apiBase: params.apiBase,
        targetLang,
      }),
      translateWithDeepL({
        text: params.analysis.explanation,
        authKey: params.authKey,
        apiBase: params.apiBase,
        targetLang,
      }),
      translateWithDeepL({
        text: params.analysis.disclaimer,
        authKey: params.authKey,
        apiBase: params.apiBase,
        targetLang,
      }),
    ]);

  const translatedReasons = reasonsTranslation.text
    .split("\n")
    .map((reason) => reason.trim())
    .filter((reason) => reason.length > 0);

  return {
    ...params.analysis,
    reasons:
      translatedReasons.length > 0
        ? translatedReasons
        : params.analysis.reasons,
    explanation: explanationTranslation.text.trim(),
    disclaimer: disclaimerTranslation.text.trim(),
  };
}

async function translateMediaAnalysis(params: {
  analysis: MediaAnalysis;
  outputLanguage: string;
  authKey?: string;
  apiBase: string;
}): Promise<MediaAnalysis> {
  const targetLang = getDeepLTargetLanguage(params.outputLanguage);

  if (!targetLang || !params.authKey || params.authKey.trim().length === 0) {
    return params.analysis;
  }

  const explanationSeparatorIndex = params.analysis.explanation.indexOf("\n\n");

  const authenticityExplanation =
    explanationSeparatorIndex >= 0
      ? params.analysis.explanation.slice(0, explanationSeparatorIndex)
      : params.analysis.explanation;

  const fraudExplanation =
    explanationSeparatorIndex >= 0
      ? params.analysis.explanation.slice(explanationSeparatorIndex + 2)
      : "";

  const [
    authenticityReasonsTranslation,
    fraudReasonsTranslation,
    authenticityExplanationTranslation,
    fraudExplanationTranslation,
    disclaimerTranslation,
  ] = await Promise.all([
    params.analysis.authenticityReasons.length > 0
      ? translateWithDeepL({
          text: params.analysis.authenticityReasons.join("\n"),
          authKey: params.authKey,
          apiBase: params.apiBase,
          targetLang,
        })
      : Promise.resolve({ text: "" }),

    params.analysis.fraudReasons.length > 0
      ? translateWithDeepL({
          text: params.analysis.fraudReasons.join("\n"),
          authKey: params.authKey,
          apiBase: params.apiBase,
          targetLang,
        })
      : Promise.resolve({ text: "" }),

    authenticityExplanation.trim().length > 0
      ? translateWithDeepL({
          text: authenticityExplanation,
          authKey: params.authKey,
          apiBase: params.apiBase,
          targetLang,
        })
      : Promise.resolve({ text: "" }),

    fraudExplanation.trim().length > 0
      ? translateWithDeepL({
          text: fraudExplanation,
          authKey: params.authKey,
          apiBase: params.apiBase,
          targetLang,
        })
      : Promise.resolve({ text: "" }),

    params.analysis.disclaimer.trim().length > 0
      ? translateWithDeepL({
          text: params.analysis.disclaimer,
          authKey: params.authKey,
          apiBase: params.apiBase,
          targetLang,
        })
      : Promise.resolve({ text: "" }),
  ]);

  const translatedAuthenticityReasons = authenticityReasonsTranslation.text
    .split("\n")
    .map((reason) => reason.trim())
    .filter((reason) => reason.length > 0);

  const translatedFraudReasons = fraudReasonsTranslation.text
    .split("\n")
    .map((reason) => reason.trim())
    .filter((reason) => reason.length > 0);

  const translatedExplanation = [
    authenticityExplanationTranslation.text.trim() ||
      authenticityExplanation.trim(),
    fraudExplanationTranslation.text.trim() || fraudExplanation.trim(),
  ]
    .filter((text) => text.length > 0)
    .join("\n\n");

  return {
    ...params.analysis,
    authenticityReasons:
      translatedAuthenticityReasons.length > 0
        ? translatedAuthenticityReasons
        : params.analysis.authenticityReasons,
    fraudReasons:
      translatedFraudReasons.length > 0
        ? translatedFraudReasons
        : params.analysis.fraudReasons,
    explanation: translatedExplanation,
    disclaimer: disclaimerTranslation.text.trim() || params.analysis.disclaimer,
  };
}

const SCAN_RATE_LIMIT_WINDOW_MS = 3000;
const lastScanAtByDevice = new Map<string, number>();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  ADMIN_TOKEN: z.string().min(8),
  CORS_ORIGIN: z.string().default("*"),

  FREE_WEEKLY_LIMIT: z.coerce.number().int().min(0).default(3),
  FREE_WEEKLY_AI_LIMIT: z.coerce.number().int().min(0).default(1),

  REVENUECAT_WEBHOOK_AUTH: z.string().min(8),

  DEEPL_AUTH_KEY: z.string().optional(),
  DEEPL_API_BASE: z.string().default("https://api-free.deepl.com"),
  DEEPL_TARGET_LANG: z.string().default("EN"),

  AI_PROVIDER: z.enum(["ollama"]).default("ollama"),
  AI_MODE: z.enum(["local", "cloud"]).default("local"),
  AI_BASE_URL: z.string().optional(),
  AI_MODEL: z.string().default("llava:latest"),
  AI_API_KEY: z.string().optional(),
});

const env = envSchema.parse({
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  CORS_ORIGIN: process.env.CORS_ORIGIN,

  FREE_WEEKLY_LIMIT: process.env.FREE_WEEKLY_LIMIT,
  FREE_WEEKLY_AI_LIMIT: process.env.FREE_WEEKLY_AI_LIMIT,

  REVENUECAT_WEBHOOK_AUTH: process.env.REVENUECAT_WEBHOOK_AUTH,

  DEEPL_AUTH_KEY: process.env.DEEPL_AUTH_KEY,
  DEEPL_API_BASE: process.env.DEEPL_API_BASE,
  DEEPL_TARGET_LANG: process.env.DEEPL_TARGET_LANG,

  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_MODE: process.env.AI_MODE,
  AI_BASE_URL: process.env.AI_BASE_URL,
  AI_MODEL: process.env.AI_MODEL,
  AI_API_KEY: process.env.AI_API_KEY,
});

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024,
});

await app.register(cors, {
  origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
});

const pool = createPool(env.DATABASE_URL);

app.addHook("preHandler", async (req) => {
  const deviceId = req.headers["x-device-id"];
  if (typeof deviceId === "string" && deviceId.length > 0) {
    await ensureDevice(pool, deviceId);
  }
});

app.get("/health", async () => {
  return { ok: true, ts: new Date().toISOString() };
});

app.get("/rules", async () => {
  return getDefaultRules();
});

app.get("/subscriptions/status", async (req) => {
  const deviceId = req.headers["x-device-id"];
  if (typeof deviceId !== "string" || deviceId.length === 0) {
    return { isPremium: false };
  }

  const isPremium = await getPremiumStatus(pool, deviceId);
  return { isPremium };
});

app.get("/usage/week", async (req, reply) => {
  const deviceId = req.headers["x-device-id"];
  if (typeof deviceId !== "string" || deviceId.length === 0) {
    return reply.code(400).send({ error: "missing_device_id" });
  }

  const isPremium = await getPremiumStatus(pool, deviceId);
  const { yearWeek, resetAt } = getIsoWeekKey(new Date());

  const totalWeeklyUsed = await getWeeklyUsage(pool, deviceId, yearWeek);
  const aiWeeklyUsed = await getWeeklyAiUsage(pool, deviceId, yearWeek);

  const normalWeeklyLimit = Math.max(
    0,
    env.FREE_WEEKLY_LIMIT - env.FREE_WEEKLY_AI_LIMIT,
  );
  const normalWeeklyUsed = Math.max(0, totalWeeklyUsed - aiWeeklyUsed);
  const normalWeeklyRemaining = isPremium
    ? null
    : Math.max(0, normalWeeklyLimit - normalWeeklyUsed);

  const weeklyLimit = isPremium ? null : normalWeeklyLimit;
  const weeklyUsed = isPremium ? totalWeeklyUsed : normalWeeklyUsed;
  const weeklyRemaining = normalWeeklyRemaining;

  const aiWeeklyLimit = isPremium ? null : env.FREE_WEEKLY_AI_LIMIT;
  const aiWeeklyRemaining = isPremium
    ? null
    : Math.max(0, env.FREE_WEEKLY_AI_LIMIT - aiWeeklyUsed);

  return {
    isPremium,
    weeklyLimit,
    weeklyUsed,
    weeklyRemaining,
    aiWeeklyLimit,
    aiWeeklyUsed,
    aiWeeklyRemaining,
    aiResetAt: resetAt,
    aiUnlimited: isPremium,
  };
});

app.get("/stats", async (req, reply) => {
  const deviceId = req.headers["x-device-id"];

  if (typeof deviceId !== "string" || deviceId.length === 0) {
    return reply.code(400).send({ error: "missing_device_id" });
  }

  const stats = await getScanStats(pool, deviceId);

  const isPremium = await getPremiumStatus(pool, deviceId);
  const { yearWeek } = getIsoWeekKey(new Date());

  const totalWeeklyUsed = await getWeeklyUsage(pool, deviceId, yearWeek);
  const aiWeeklyUsed = await getWeeklyAiUsage(pool, deviceId, yearWeek);

  const normalWeeklyLimit = Math.max(
    0,
    env.FREE_WEEKLY_LIMIT - env.FREE_WEEKLY_AI_LIMIT,
  );

  const normalWeeklyUsed = Math.max(0, totalWeeklyUsed - aiWeeklyUsed);

  const weeklyRemaining = isPremium
    ? null
    : Math.max(0, normalWeeklyLimit - normalWeeklyUsed);

  const aiWeeklyRemaining = isPremium
    ? null
    : Math.max(0, env.FREE_WEEKLY_AI_LIMIT - aiWeeklyUsed);

  return {
    scansToday: stats.scansToday,
    scansWeek: stats.scansWeek,
    scansMonth: stats.scansMonth,
    threatsDetected: stats.threatsDetected,

    isPremium,
    weeklyRemaining,
    aiWeeklyRemaining,
  };
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
  const deviceId = req.headers["x-device-id"];

  if (typeof deviceId !== "string" || deviceId.length === 0) {
    return reply.code(400).send({ error: "missing_device_id" });
  }

  const now = Date.now();
  const lastScanAt = lastScanAtByDevice.get(deviceId);

  if (
    typeof lastScanAt === "number" &&
    now - lastScanAt < SCAN_RATE_LIMIT_WINDOW_MS
  ) {
    return reply.code(429).send({
      error: "rate_limited",
      retryAfterMs: SCAN_RATE_LIMIT_WINDOW_MS - (now - lastScanAt),
    });
  }

  lastScanAtByDevice.set(deviceId, now);

  const bodySchema = z.object({
    input: z.string().min(1).max(5000),
    outputLanguage: z.string().min(2).max(5).default("en"),
  });

  const body = bodySchema.parse(req.body);

  const MAX_INPUT_LENGTH = 1500;

  if (body.input.length > MAX_INPUT_LENGTH) {
    return reply.code(400).send({
      error: "input_too_long",
      maxLength: MAX_INPUT_LENGTH,
    });
  }

  const { yearWeek, resetAt } = getIsoWeekKey(new Date());

  let isPremium = false;
  if (typeof deviceId === "string" && deviceId.length > 0) {
    isPremium = await getPremiumStatus(pool, deviceId);
  }

  const FREE_WEEKLY_LIMIT = env.FREE_WEEKLY_LIMIT;

  if (!isPremium) {
    if (typeof deviceId !== "string" || deviceId.length === 0) {
      return reply.code(400).send({ error: "missing_device_id" });
    }

    const current = await getWeeklyUsage(pool, deviceId, yearWeek);

    if (current >= FREE_WEEKLY_LIMIT) {
      return reply.code(402).send({
        error: "quota_exceeded",
        limit: FREE_WEEKLY_LIMIT,
        remaining: 0,
        resetAt,
      });
    }
  }

  const rules = getDefaultRules();

  let textForScoring = body.input;

  if (env.DEEPL_AUTH_KEY && env.DEEPL_AUTH_KEY.trim().length > 0) {
    try {
      const tr = await translateWithDeepL({
        text: body.input,
        authKey: env.DEEPL_AUTH_KEY,
        apiBase: env.DEEPL_API_BASE,
        targetLang: env.DEEPL_TARGET_LANG,
      });

      textForScoring = tr.text;
    } catch (e) {
      req.log.warn(
        { err: e },
        "DeepL translation failed, using original input",
      );
    }
  }

  const scan = scoreInput(textForScoring, rules);
  const classic = scan;

  const aiBaseUrl = env.AI_BASE_URL?.trim().length
    ? env.AI_BASE_URL.trim()
    : env.AI_MODE === "cloud"
      ? "https://ollama.com"
      : "http://host.docker.internal:11434";

  const aiConfigured =
    env.AI_PROVIDER === "ollama" &&
    typeof env.AI_MODEL === "string" &&
    env.AI_MODEL.trim().length > 0 &&
    typeof aiBaseUrl === "string" &&
    aiBaseUrl.length > 0 &&
    (env.AI_MODE === "local" ||
      (typeof env.AI_API_KEY === "string" && env.AI_API_KEY.trim().length > 0));

  let aiAllowed = false;
  let aiUsed = false;

  if (aiConfigured) {
    if (isPremium) {
      aiAllowed = true;
    } else {
      if (typeof deviceId !== "string" || deviceId.length === 0) {
        return reply.code(400).send({ error: "missing_device_id" });
      }

      const currentAi = await getWeeklyAiUsage(pool, deviceId, yearWeek);
      const FREE_WEEKLY_AI_LIMIT = env.FREE_WEEKLY_AI_LIMIT;

      if (currentAi < FREE_WEEKLY_AI_LIMIT) {
        aiAllowed = true;
      }
    }
  }

  const AI_ANALYSIS_TIMEOUT_MS = 90000;
  let ai: AiAnalysis | null = null;

  if (aiAllowed) {
    try {
      ai = await withTimeout(
        analyzeWithAI({
          baseUrl: aiBaseUrl,
          apiKey: env.AI_MODE === "cloud" ? env.AI_API_KEY?.trim() : undefined,
          model: env.AI_MODEL,
          input: body.input,
          outputLanguage: body.outputLanguage,
        }),
        AI_ANALYSIS_TIMEOUT_MS,
        `AI analysis timed out after ${AI_ANALYSIS_TIMEOUT_MS}ms`,
      );

      aiUsed = true;
    } catch (e) {
      req.log.warn({ err: e }, "AI analysis failed");

      return reply.code(503).send({
        error: "ai_unavailable",
        message: "AI analysis failed",
      });
    }
  }

  const finalRiskScore = ai?.riskScore ?? classic.riskScore;
  const finalCategory = ai?.category ?? classic.category;
  const finalThreatType: ThreatType =
    ai?.threatType ?? inferClassicThreatType(textForScoring, finalCategory);
  const finalReasons = ai?.reasons ?? classic.reasons;
  const isThreat = finalCategory !== "low_risk";
  const inputPreview = buildInputPreview(body.input);

  if (!isPremium && typeof deviceId === "string" && deviceId.length > 0) {
    await incrementWeeklyUsage(pool, deviceId, yearWeek);

    if (aiUsed) {
      await incrementWeeklyAiUsage(pool, deviceId, yearWeek);
    }
  }

  let totalWeeklyUsed = 0;
  if (typeof deviceId === "string" && deviceId.length > 0) {
    totalWeeklyUsed = await getWeeklyUsage(pool, deviceId, yearWeek);
  }

  let aiWeeklyUsed = 0;
  if (typeof deviceId === "string" && deviceId.length > 0) {
    aiWeeklyUsed = await getWeeklyAiUsage(pool, deviceId, yearWeek);
  }

  const normalWeeklyLimit = Math.max(
    0,
    env.FREE_WEEKLY_LIMIT - env.FREE_WEEKLY_AI_LIMIT,
  );
  const normalWeeklyUsed = Math.max(0, totalWeeklyUsed - aiWeeklyUsed);
  const normalWeeklyRemaining = isPremium
    ? null
    : Math.max(0, normalWeeklyLimit - normalWeeklyUsed);

  const weeklyLimit = isPremium ? null : normalWeeklyLimit;
  const weeklyUsed = isPremium ? totalWeeklyUsed : normalWeeklyUsed;
  const weeklyRemaining = normalWeeklyRemaining;

  const aiWeeklyLimit = isPremium ? null : env.FREE_WEEKLY_AI_LIMIT;
  const aiWeeklyRemaining = isPremium
    ? null
    : Math.max(0, env.FREE_WEEKLY_AI_LIMIT - aiWeeklyUsed);

  await insertScanEvent(pool, {
    id: createEventId(),
    deviceId,
    inputPreview,
    finalCategory,
    threatType: finalThreatType,
    finalRiskScore,
    classicCategory: classic.category,
    classicRiskScore: classic.riskScore,
    aiUsed,
    isThreat,
  });

  return {
    riskScore: finalRiskScore,
    category: finalCategory,
    threatType: finalThreatType,
    reasons: finalReasons,

    classicRiskScore: classic.riskScore,
    classicCategory: classic.category,
    classicReasons: classic.reasons,

    weeklyLimit,
    weeklyUsed,
    weeklyRemaining,

    aiAllowed,
    aiUsed,
    aiExplanation: ai?.explanation ?? null,

    aiWeeklyLimit,
    aiWeeklyUsed,
    aiWeeklyRemaining,
    aiResetAt: resetAt,
    aiUnlimited: isPremium,

    isPremium,
  };
});

app.post("/media-analysis", async (req, reply) => {
  const deviceId = req.headers["x-device-id"];

  if (typeof deviceId !== "string" || deviceId.length === 0) {
    return reply.code(400).send({ error: "missing_device_id" });
  }

  const bodySchema = z.object({
    imageBase64: z.string().min(1).max(8_000_000),
    extractedText: z.string().max(5000).default(""),
    mediaSignals: z.string().max(5000).default(""),
    imageForensics: z
      .object({
        rawLogit: z.number(),
        threshold: z.number(),
        isAiGenerated: z.boolean(),
      })
      .optional(),
    outputLanguage: z.string().min(2).max(5).default("en"),
  });

  const parsedBody = bodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    req.log.warn(
      { issues: parsedBody.error.issues },
      "Invalid media analysis request",
    );
    return reply.code(400).send({
      error: "invalid_request",
      issues: parsedBody.error.issues,
    });
  }

  const body = parsedBody.data;

  const now = Date.now();
  const lastScanAt = lastScanAtByDevice.get(deviceId);

  if (
    typeof lastScanAt === "number" &&
    now - lastScanAt < SCAN_RATE_LIMIT_WINDOW_MS
  ) {
    return reply.code(429).send({
      error: "rate_limited",
      retryAfterMs: SCAN_RATE_LIMIT_WINDOW_MS - (now - lastScanAt),
    });
  }

  lastScanAtByDevice.set(deviceId, now);

  const { yearWeek, resetAt } = getIsoWeekKey(new Date());
  const isPremium = await getPremiumStatus(pool, deviceId);

  if (!isPremium) {
    const totalWeeklyUsed = await getWeeklyUsage(pool, deviceId, yearWeek);

    if (totalWeeklyUsed >= env.FREE_WEEKLY_LIMIT) {
      return reply.code(402).send({
        error: "quota_exceeded",
        limit: env.FREE_WEEKLY_LIMIT,
        remaining: 0,
        resetAt,
      });
    }

    const currentAi = await getWeeklyAiUsage(pool, deviceId, yearWeek);

    if (currentAi >= env.FREE_WEEKLY_AI_LIMIT) {
      return reply.code(402).send({
        error: "ai_quota_exceeded",
        limit: env.FREE_WEEKLY_AI_LIMIT,
        remaining: 0,
        resetAt,
      });
    }
  }

  const aiBaseUrl = env.AI_BASE_URL?.trim().length
    ? env.AI_BASE_URL.trim()
    : env.AI_MODE === "cloud"
      ? "https://ollama.com"
      : "http://host.docker.internal:11434";

  const aiConfigured =
    env.AI_PROVIDER === "ollama" &&
    typeof env.AI_MODEL === "string" &&
    env.AI_MODEL.trim().length > 0 &&
    typeof aiBaseUrl === "string" &&
    aiBaseUrl.length > 0 &&
    (env.AI_MODE === "local" ||
      (typeof env.AI_API_KEY === "string" && env.AI_API_KEY.trim().length > 0));

  if (!aiConfigured) {
    return reply.code(503).send({
      error: "ai_unavailable",
      message: "AI analysis is not configured",
    });
  }

  const AI_MEDIA_ANALYSIS_TIMEOUT_MS = 90000;

  try {
    let analysis = await withTimeout(
      analyzeMediaWithAI({
        baseUrl: aiBaseUrl,
        apiKey: env.AI_MODE === "cloud" ? env.AI_API_KEY?.trim() : undefined,
        model: env.AI_MODEL,
        imageBase64: body.imageBase64,
        extractedText: body.extractedText,
        mediaSignals: body.mediaSignals,
        imageForensics: body.imageForensics,
        outputLanguage: body.outputLanguage,
      }),
      AI_MEDIA_ANALYSIS_TIMEOUT_MS,
      `AI media analysis timed out after ${AI_MEDIA_ANALYSIS_TIMEOUT_MS}ms`,
    );

    try {
      analysis = await translateMediaAnalysis({
        analysis,
        outputLanguage: body.outputLanguage,
        authKey: env.DEEPL_AUTH_KEY,
        apiBase: env.DEEPL_API_BASE,
      });
    } catch (e) {
      req.log.warn(
        { err: e },
        "DeepL media analysis response translation failed",
      );
    }

    if (!isPremium) {
      await incrementWeeklyUsage(pool, deviceId, yearWeek);
      await incrementWeeklyAiUsage(pool, deviceId, yearWeek);
    }

    const totalWeeklyUsed = await getWeeklyUsage(pool, deviceId, yearWeek);
    const aiWeeklyUsed = await getWeeklyAiUsage(pool, deviceId, yearWeek);
    const aiWeeklyLimit = isPremium ? null : env.FREE_WEEKLY_AI_LIMIT;
    const aiWeeklyRemaining = isPremium
      ? null
      : Math.max(0, env.FREE_WEEKLY_AI_LIMIT - aiWeeklyUsed);

    return {
      ...analysis,
      isPremium,
      aiUsed: true,
      aiWeeklyLimit,
      aiWeeklyUsed,
      aiWeeklyRemaining,
      aiResetAt: resetAt,
      aiUnlimited: isPremium,
      totalWeeklyUsed,
    };
  } catch (e) {
    req.log.warn({ err: e }, "AI media analysis failed");

    return reply.code(503).send({
      error: "ai_unavailable",
      message: "AI media analysis failed",
    });
  }
});

app.post("/image-authenticity", async (req, reply) => {
  const deviceId = req.headers["x-device-id"];

  if (typeof deviceId !== "string" || deviceId.length === 0) {
    return reply.code(400).send({ error: "missing_device_id" });
  }

  const bodySchema = z.object({
    imageSignals: z.string().min(1).max(5000),
    imageBase64: z.string().min(1).max(4_000_000),
    outputLanguage: z.string().min(2).max(5).default("en"),
  });

  const body = bodySchema.parse(req.body);

  const MAX_IMAGE_SIGNALS_LENGTH = 3000;

  if (body.imageSignals.length > MAX_IMAGE_SIGNALS_LENGTH) {
    return reply.code(400).send({
      error: "input_too_long",
      maxLength: MAX_IMAGE_SIGNALS_LENGTH,
    });
  }

  const isPremium = await getPremiumStatus(pool, deviceId);

  if (!isPremium) {
    return reply.code(403).send({ error: "premium_required" });
  }

  const aiBaseUrl = env.AI_BASE_URL?.trim().length
    ? env.AI_BASE_URL.trim()
    : env.AI_MODE === "cloud"
      ? "https://ollama.com"
      : "http://host.docker.internal:11434";

  const aiConfigured =
    env.AI_PROVIDER === "ollama" &&
    typeof env.AI_MODEL === "string" &&
    env.AI_MODEL.trim().length > 0 &&
    typeof aiBaseUrl === "string" &&
    aiBaseUrl.length > 0 &&
    (env.AI_MODE === "local" ||
      (typeof env.AI_API_KEY === "string" && env.AI_API_KEY.trim().length > 0));

  if (!aiConfigured) {
    return reply.code(503).send({
      error: "ai_unavailable",
      message: "AI analysis is not configured",
    });
  }

  const AI_IMAGE_AUTHENTICITY_TIMEOUT_MS = 90000;

  try {
    let analysis = await withTimeout(
      analyzeImageAuthenticityWithAI({
        baseUrl: aiBaseUrl,
        apiKey: env.AI_MODE === "cloud" ? env.AI_API_KEY?.trim() : undefined,
        model: env.AI_MODEL,
        imageSignals: body.imageSignals,
        imageBase64: body.imageBase64,
        outputLanguage: body.outputLanguage,
      }),
      AI_IMAGE_AUTHENTICITY_TIMEOUT_MS,
      `AI image authenticity analysis timed out after ${AI_IMAGE_AUTHENTICITY_TIMEOUT_MS}ms`,
    );

    try {
      analysis = await translateImageAuthenticityAnalysis({
        analysis,
        outputLanguage: body.outputLanguage,
        authKey: env.DEEPL_AUTH_KEY,
        apiBase: env.DEEPL_API_BASE,
      });
    } catch (e) {
      req.log.warn(
        { err: e },
        "DeepL image authenticity response translation failed",
      );
    }

    return {
      ...analysis,
      isPremium,
    };
  } catch (e) {
    req.log.warn({ err: e }, "AI image authenticity analysis failed");

    return reply.code(503).send({
      error: "ai_unavailable",
      message: "AI image authenticity analysis failed",
    });
  }
});

app.post("/admin/subscriptions/set", async (req, reply) => {
  const token = req.headers["x-admin-token"];
  if (token !== env.ADMIN_TOKEN) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  const bodySchema = z.object({
    deviceId: z.string().min(6).max(128),
    isPremium: z.boolean(),
  });

  const body = bodySchema.parse(req.body);
  await setPremiumStatus(pool, body.deviceId, body.isPremium);

  return { ok: true };
});

app.post("/webhooks/revenuecat", async (req, reply) => {
  const authorization = req.headers.authorization;

  if (authorization !== env.REVENUECAT_WEBHOOK_AUTH) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  const body = req.body as {
    event?: {
      type?: string;
      app_user_id?: string;
      environment?: string;
    };
  };

  const event = body?.event;
  const deviceId = event?.app_user_id;
  const eventType = event?.type;

  if (
    typeof deviceId !== "string" ||
    deviceId.length === 0 ||
    typeof eventType !== "string" ||
    eventType.length === 0
  ) {
    return reply.code(200).send({ ok: true });
  }

  if (
    eventType === "INITIAL_PURCHASE" ||
    eventType === "RENEWAL" ||
    eventType === "UNCANCELLATION" ||
    eventType === "NON_RENEWING_PURCHASE"
  ) {
    await setPremiumStatus(pool, deviceId, true);
    return reply.code(200).send({ ok: true });
  }

  if (eventType === "EXPIRATION") {
    await setPremiumStatus(pool, deviceId, false);
    return reply.code(200).send({ ok: true });
  }

  return reply.code(200).send({ ok: true });
});

app.setErrorHandler((err, _req, reply) => {
  app.log.error(err);
  const status = (err as any)?.statusCode ?? 500;
  reply.code(status).send({ error: "server_error" });
});

await app.listen({ port: env.PORT, host: "0.0.0.0" });
