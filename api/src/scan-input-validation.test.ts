import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { qrContentsSchema } from "./scan-input-validation.js";

describe("bounded request collections", () => {
  it("rejects excess QR entries with one size issue, rather than an issue per element", () => {
    const result = qrContentsSchema.safeParse(Array(616).fill(1));
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected oversized QR input to fail");
    expect(result.error.issues).toEqual([
      expect.objectContaining({ code: "too_big", maximum: 16, path: [] }),
    ]);
  });

  it("does not invoke custom element validation before rejecting an oversized array", () => {
    const inspectElement = vi.fn(() => true);
    const schema = z.array(z.custom(inspectElement)).max(16);
    const result = schema.safeParse(Array(616).fill("value"));
    expect(result.success).toBe(false);
    expect(inspectElement).not.toHaveBeenCalled();
    if (result.success) throw new Error("Expected oversized array to fail");
    expect(result.error.issues).toHaveLength(1);
  });

  it("preserves the QR default, entry count and individual length limits", () => {
    expect(qrContentsSchema.parse(undefined)).toEqual([]);
    expect(qrContentsSchema.parse(Array(16).fill("https://example.com"))).toHaveLength(16);
    expect(qrContentsSchema.safeParse(["a".repeat(4096)]).success).toBe(true);
    expect(qrContentsSchema.safeParse(["a".repeat(4097)]).success).toBe(false);
    expect(qrContentsSchema.safeParse([1]).success).toBe(false);
  });

  it("preserves the total QR length bound", () => {
    expect(qrContentsSchema.safeParse(Array(4).fill("a".repeat(4096))).success).toBe(true);
    expect(qrContentsSchema.safeParse([...Array(4).fill("a".repeat(4096)), "a"]).success).toBe(false);
  });
});
