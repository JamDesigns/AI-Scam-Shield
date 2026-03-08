import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";

import {
  createPool,
  ensureDevice,
  getPremiumStatus,
  setPremiumStatus,
  getWeeklyUsage,
  incrementWeeklyUsage,
  getWeeklyAiUsage,
  incrementWeeklyAiUsage,
} from "./db.js";
import { getDefaultRules, scoreInput } from "./rules.js";
import { translateWithDeepL } from "./translate.js";
import { analyzeWithAI, type AiAnalysis } from "./ai.js";

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
  AI_MODEL: z.string().default("llama3.1:8b"),
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

      if (
        ai &&
        !isPremium &&
        typeof deviceId === "string" &&
        deviceId.length > 0
      ) {
        await incrementWeeklyAiUsage(pool, deviceId, yearWeek);
      }

      if (ai) {
        aiUsed = true;
      }
    } catch (e) {
      req.log.warn({ err: e }, "AI analysis failed, falling back to classic");
      ai = null;
      aiUsed = false;
    }
  }

  const finalRiskScore = ai?.riskScore ?? classic.riskScore;
  const finalCategory = ai?.category ?? classic.category;
  const finalReasons = ai?.reasons ?? classic.reasons;

  if (!isPremium && typeof deviceId === "string" && deviceId.length > 0) {
    await incrementWeeklyUsage(pool, deviceId, yearWeek);
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

  return {
    riskScore: finalRiskScore,
    category: finalCategory,
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

app.setErrorHandler((err, _req, reply) => {
  app.log.error(err);
  const status = (err as any)?.statusCode ?? 500;
  reply.code(status).send({ error: "server_error" });
});

await app.listen({ port: env.PORT, host: "0.0.0.0" });
