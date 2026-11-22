import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { getScanStats, getScanActivity } from "./db.js";
import { getTimeContext } from "./scan-operations.js";

const clockRow = { as_of: "2026-10-30T12:00:00Z", year_week: "2026-W44", today_start: "2026-10-29T23:00:00Z",
  week_start: "2026-10-25T23:00:00Z", month_start: "2026-09-30T22:00:00Z", year_start: "2025-12-31T23:00:00Z", reset_at: "2026-11-01T23:00:00Z" };

describe("personal statistics contract", () => {
  it("uses IANA calendar boundaries from PostgreSQL and returns ISO instants", async () => {
    const query = vi.fn(async () => ({ rows: [clockRow] }));
    const result = await getTimeContext({ query } as unknown as pg.Pool, "Europe/Madrid", new Date("2026-10-30T12:00:00Z"));
    expect(query.mock.calls[0][1]).toEqual(["2026-10-30T12:00:00.000Z", "Europe/Madrid"]);
    expect(query.mock.calls[0][0]).toContain("AT TIME ZONE $2");
    expect(query.mock.calls[0][0]).toContain("INTERVAL '29 days'");
    expect(result).toMatchObject({ yearWeek: "2026-W44", resetAt: "2026-11-01T23:00:00.000Z", monthStartAt: "2026-09-30T22:00:00.000Z" });
  });
  it("selects the requested period with risk counts, including inconclusive rather than low", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [clockRow] }).mockResolvedValueOnce({ rows: [
      { period: "today", start_at: clockRow.today_start, total_scans: 2, threats_detected: 1, low_risk: 0, medium_risk: 1, high_risk: 0, inconclusive: 1 },
      { period: "week", start_at: clockRow.week_start, total_scans: 3, threats_detected: 1, low_risk: 1, medium_risk: 1, high_risk: 0, inconclusive: 1 },
      { period: "month", start_at: clockRow.month_start, total_scans: 6, threats_detected: 3, low_risk: 2, medium_risk: 2, high_risk: 1, inconclusive: 1 },
      { period: "year", start_at: clockRow.year_start, total_scans: 10, threats_detected: 4, low_risk: 5, medium_risk: 3, high_risk: 1, inconclusive: 1 },
    ] });
    const result = await getScanStats({ query } as unknown as pg.Pool, "synthetic-owner", "Europe/Madrid", "today");
    expect(result).toMatchObject({ timeZone: "Europe/Madrid", period: "today", totalScans: 2, threatsDetected: 1,
      scansToday: 2, scansWeek: 3, scansMonth: 6, scansYear: 10, riskBreakdown: { low_risk: 0, medium_risk: 1, high_risk: 0, inconclusive: 1 } });
    expect(query.mock.calls[1][1][0]).toBe("synthetic-owner");
    expect(query.mock.calls[1][0]).toContain("s.device_id = $1");
    expect(result.periods.month.startAt).toBe("2026-09-30T22:00:00.000Z");
  });
});


describe("typed activity previews", () => {
  it("returns the stored media type and preserves identical literal text previews", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [
      { id: 'media', input_type: 'image', input_preview: '[image]', created_at: '2026-11-19T12:00:00Z', final_category: 'inconclusive', final_risk_score: null },
      { id: 'text', input_type: 'text', input_preview: '[image]', created_at: '2026-11-19T12:00:00Z', final_category: 'low_risk', final_risk_score: 0 },
    ] });
    const items = await getScanActivity({ query } as unknown as pg.Pool, 'owner', 1, 20);
    expect(items.map(x => [x.inputType, x.inputPreview])).toEqual([['image', '[image]'], ['text', '[image]']]);
    expect(query.mock.calls[0][0]).toContain('input_type');
    expect(query.mock.calls[0][1]).toEqual(['owner', 20, 0]);
  });
});
