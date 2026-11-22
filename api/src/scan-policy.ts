export type ScanKind = "text" | "image" | "video" | "image_authenticity";
export type StatsPeriod = "today" | "week" | "month" | "year";

export class ScanPolicyError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export function validateTimeZone(value: unknown): string {
  if (value === undefined) return "UTC";
  if (typeof value !== "string" || value.length > 100 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)) {
    throw new ScanPolicyError("invalid_time_zone", 400);
  }
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new ScanPolicyError("invalid_time_zone", 400);
  }
}

export function selectScanMode(params: {
  isPremium: boolean;
  completedFreeScans: number;
  kind: ScanKind;
  weeklyLimit: number;
}): { aiUsed: boolean; ordinal: number | null } {
  if (params.isPremium) return { aiUsed: true, ordinal: null };
  if (params.completedFreeScans >= params.weeklyLimit) {
    throw new ScanPolicyError("quota_exceeded", 402, { limit: params.weeklyLimit, remaining: 0 });
  }
  const ordinal = params.completedFreeScans + 1;
  if (ordinal > 1 && params.kind !== "text") {
    throw new ScanPolicyError("ai_quota_exceeded", 402, { limit: 1, remaining: 0 });
  }
  return { aiUsed: ordinal === 1, ordinal };
}

export function buildUsageResponse(params: {
  isPremium: boolean;
  totalWeeklyUsed: number;
  aiWeeklyUsed: number;
  weeklyLimit: number;
  resetAt: string;
  timeZone: string;
}) {
  const normalUsed = Math.max(0, params.totalWeeklyUsed - params.aiWeeklyUsed);
  const normalLimit = Math.max(0, params.weeklyLimit - 1);
  return {
    isPremium: params.isPremium,
    // Retain the established two normal + one AI counters for existing clients.
    weeklyLimit: params.isPremium ? null : normalLimit,
    weeklyUsed: normalUsed,
    weeklyRemaining: params.isPremium ? null : Math.max(0, normalLimit - normalUsed),
    aiWeeklyLimit: params.isPremium ? null : 1,
    aiWeeklyUsed: params.aiWeeklyUsed,
    aiWeeklyRemaining: params.isPremium ? null : (params.totalWeeklyUsed === 0 ? 1 : 0),
    totalWeeklyLimit: params.isPremium ? null : params.weeklyLimit,
    totalWeeklyUsed: params.totalWeeklyUsed,
    totalWeeklyRemaining: params.isPremium ? null : Math.max(0, params.weeklyLimit - params.totalWeeklyUsed),
    nextAnalysisUsesAi: params.isPremium || params.totalWeeklyUsed === 0,
    aiUnlimited: params.isPremium,
    aiResetAt: params.resetAt,
    resetAt: params.resetAt,
    timeZone: params.timeZone,
  };
}
