import { describe, expect, it } from "vitest";
import { buildUsageResponse, selectScanMode, validateTimeZone } from "./scan-policy.js";

describe("weekly plan policy", () => {
  it.each(["text", "image", "video", "image_authenticity"] as const)("uses AI on the first free %s operation", (kind) => {
    expect(selectScanMode({ kind, isPremium: false, completedFreeScans: 0, weeklyLimit: 3 })).toEqual({ aiUsed: true, ordinal: 1 });
  });
  it.each([1, 2])("uses classic text after %i completed scans", (completedFreeScans) => {
    expect(selectScanMode({ kind: "text", isPremium: false, completedFreeScans, weeklyLimit: 3 }).aiUsed).toBe(false);
    expect(() => selectScanMode({ kind: "image", isPremium: false, completedFreeScans, weeklyLimit: 3 })).toThrow("ai_quota_exceeded");
    expect(() => selectScanMode({ kind: "video", isPremium: false, completedFreeScans, weeklyLimit: 3 })).toThrow("ai_quota_exceeded");
  });
  it("refuses the fourth free scan but does not cap premium AI", () => {
    expect(() => selectScanMode({ kind: "text", isPremium: false, completedFreeScans: 3, weeklyLimit: 3 })).toThrow("quota_exceeded");
    expect(selectScanMode({ kind: "video", isPremium: true, completedFreeScans: 1000, weeklyLimit: 3 })).toEqual({ aiUsed: true, ordinal: null });
  });
  it("keeps total and legacy normal counters distinct", () => {
    expect(buildUsageResponse({ isPremium: false, totalWeeklyUsed: 1, aiWeeklyUsed: 1, weeklyLimit: 3, resetAt: "2026-11-01T23:00:00Z", timeZone: "Europe/Madrid" })).toMatchObject({
      weeklyRemaining: 2, aiWeeklyRemaining: 0, totalWeeklyRemaining: 2, nextAnalysisUsesAi: false,
    });
  });
});

describe("IANA user time zone", () => {
  it("defaults to UTC and accepts a real IANA zone", () => {
    expect(validateTimeZone(undefined)).toBe("UTC");
    expect(validateTimeZone("Europe/Madrid")).toBe("Europe/Madrid");
  });
  it.each(["", "Mars/Unknown", "+02:00", "Europe/Madrid; DROP TABLE devices", ["UTC"]])("rejects invalid time zone %s", (zone) => {
    expect(() => validateTimeZone(zone)).toThrow("invalid_time_zone");
  });
});
