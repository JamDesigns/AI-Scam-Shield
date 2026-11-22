import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { consumeSharedRateLimit, enrollmentSubject } from "./shared-rate-limit.js";

describe("shared anonymous enrollment limit", () => {
  it("stores a keyed digest rather than an IP and normalizes IPv4-mapped addresses", () => {
    const secret = "synthetic-secret-with-at-least-thirty-two-characters";
    expect(enrollmentSubject("::ffff:192.0.2.1", secret)).toBe(enrollmentSubject("192.0.2.1", secret));
    expect(enrollmentSubject("192.0.2.1", secret)).toMatch(/^[a-f0-9]{64}$/);
    expect(enrollmentSubject("192.0.2.1", secret)).not.toContain("192.0.2.1");
    expect(() => enrollmentSubject("192.0.2.1", "short")).toThrow("not_configured");
  });
  it("uses a single conditional UPSERT so concurrent replicas cannot both exceed the bucket", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ allowed: true, retry_after_seconds: 12 }] })
      .mockResolvedValueOnce({ rows: [{ allowed: false, retry_after_seconds: 12 }] });
    const pool = { query } as unknown as Pick<pg.Pool, "query">;
    const params = { scope: "session_enrollment", subjectHash: "a".repeat(64), limit: 5, windowSeconds: 3600 };
    expect((await consumeSharedRateLimit(pool, params)).allowed).toBe(true);
    expect(await consumeSharedRateLimit(pool, params)).toEqual({ allowed: false, retryAfterSeconds: 12 });
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT");
    expect(query.mock.calls[0][0]).toContain("request_rate_limits.request_count < $3");
    expect(query.mock.calls[0][1]).toEqual([params.scope, params.subjectHash, 5, 3600]);
  });
});
