import { describe, expect, it } from "vitest";

import { getDefaultRules, scoreInput } from "./rules.js";

describe("scoreInput", () => {
  it("returns low risk for harmless text", () => {
    const result = scoreInput(
      "This is a normal public news article about weather updates.",
      getDefaultRules(),
    );

    expect(result.category).toBe("low_risk");
    expect(result.riskScore).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("detects high risk bank phishing signals", () => {
    const result = scoreInput(
      "Urgent security alert from your bank. Your account will be suspended within 24 hours. Verify your login and card details now at http://bank-secure-login-update.xyz",
      getDefaultRules(),
    );

    expect(result.category).toBe("high_risk");
    expect(result.riskScore).toBe(100);
    expect(result.reasons).toContain("SUSPICIOUS_TLD");
    expect(result.reasons).toContain("URL_TYPO");
    expect(result.reasons).toContain("SUSPICIOUS_PATH");
    expect(result.reasons).toContain("URGENCY_LANGUAGE");
    expect(result.reasons).toContain("SENSITIVE_DATA");
  });

  it("detects URL shorteners", () => {
    const result = scoreInput(
      "Please review this document now: https://bit.ly/example",
      getDefaultRules(),
    );

    expect(result.riskScore).toBeGreaterThanOrEqual(20);
    expect(result.reasons).toContain("SHORTENER");
  });

  it("detects raw IP URLs", () => {
    const result = scoreInput(
      "Confirm your account at http://192.168.1.10/login",
      getDefaultRules(),
    );

    expect(result.riskScore).toBeGreaterThanOrEqual(35);
    expect(result.reasons).toContain("IP_URL");
  });
});
