import { describe, expect, it } from "vitest";
import { assessClassicResult, hasNaturalText } from "./classic-assessment.js";

describe("classic language coverage", () => {
  it.each(["Su cuenta ha sido bloqueada", "Vos identifiants sont nécessaires", "Проверете вашия профил", "Ελέγξτε τον λογαριασμό σας", "A public weather bulletin"])("does not infer safe English from unverified prose: %s", (input) => {
    expect(assessClassicResult({ input, score: { category: "low_risk", riskScore: 0, reasons: [] }, normalizationUnavailable: true })).toMatchObject({ category: "inconclusive", riskScore: null, languageNormalizationUnavailable: true });
  });
  it.each(["https://example.com", "example.com/path?q=test", "192.168.1.10/login", "https://example.com  https://paypal.com."])("does not require language normalization for URL-only input: %s", (input) => {
    expect(hasNaturalText(input)).toBe(false);
    expect(assessClassicResult({ input, score: { category: "low_risk", riskScore: 20, reasons: [] }, normalizationUnavailable: true })).toMatchObject({ category: "low_risk", riskScore: 20, languageNormalizationUnavailable: false });
  });
  it("retains prose alongside a URL and does not remove email addresses as URLs", () => {
    expect(hasNaturalText("Vérifiez votre compte https://example.com")).toBe(true);
    expect(hasNaturalText("contact@example.com")).toBe(true);
    expect(hasNaturalText("http://.")).toBe(true);
  });
  it.each(["medium_risk", "high_risk"] as const)("keeps positive %s evidence with the coverage warning", (category) => {
    expect(assessClassicResult({ input: "Avis de sécurité", score: { category, riskScore: category === "high_risk" ? 85 : 50, reasons: ["IP_URL"] }, normalizationUnavailable: true })).toMatchObject({ category, riskScore: category === "high_risk" ? 85 : 50, languageNormalizationUnavailable: true });
  });
  it("does not alter a result when language normalization succeeded", () => {
    expect(assessClassicResult({ input: "Bollettino pubblico", score: { category: "low_risk", riskScore: 0, reasons: [] }, normalizationUnavailable: false })).toMatchObject({ category: "low_risk", riskScore: 0, languageNormalizationUnavailable: false });
  });
});
