import { describe, expect, it } from "vitest";

import { extractUrls, getDefaultRules, scoreInput } from "./rules.js";

describe("scoreInput", () => {
  it.each(["https://paypal.com", "paypal.com", "https://www.apple.com", "https://accounts.google.com", "https://www.amazon.es"])("does not label official domain %s as a typo", (url) => {
    const result = scoreInput(url, getDefaultRules());
    expect(result.category).toBe("low_risk");
    expect(result.reasons).not.toContain("URL_TYPO");
  });

  it("still detects brands on a foreign registrable domain", () => {
    const result = scoreInput("https://paypal.com.evil.xyz/login", getDefaultRules());
    expect(result.category).toBe("high_risk");
    expect(result.reasons).toContain("URL_TYPO");
  });

  it("scores a bare IP and domain with path", () => {
    expect(scoreInput("192.168.1.10/login", getDefaultRules()).reasons).toContain("IP_URL");
    expect(scoreInput("bank-login.xyz/account", getDefaultRules()).reasons).toContain("SUSPICIOUS_TLD");
  });

  it("does not turn email addresses into URL evidence", () => {
    expect(extractUrls("Write to person@example.com for the public bulletin")).toEqual([]);
  });

  it("retains original URL evidence when translated prose changes a URL", () => {
    expect(scoreInput("Public notice at example.com", getDefaultRules(), "http://192.168.1.10/login").reasons).toContain("IP_URL");
  });

  it("ignores malformed candidates without throwing", () => {
    expect(() => scoreInput("http://. https://999.999.999.999/path", getDefaultRules())).not.toThrow();
  });

  it("does not hide a dangerous URL behind ten benign URLs", () => {
    const benign = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`).join(" ");
    expect(scoreInput(`${benign} http://192.168.1.10/login`, getDefaultRules()).reasons).toContain("IP_URL");
  });
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
