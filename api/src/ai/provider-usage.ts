import type { AiProviderRequest, AiProviderUsage } from "./ai-provider.js";

export function outputTokenLimit(request: AiProviderRequest, configured?: number): number {
  const limit = request.maxOutputTokens ?? configured ?? 4096;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 65536) {
    throw new Error("AI output token limit must be an integer between 1 and 65536");
  }
  return limit;
}

export function tokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** Instrumentation cannot change an assessment, charge a quota, or leak raw provider data. */
export function reportUsage(request: AiProviderRequest, usage: AiProviderUsage): void {
  try { request.onUsage?.(Object.freeze(usage)); } catch { /* An observer cannot fail the provider call. */ }
}
