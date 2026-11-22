import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES, getOutputLanguageName, getAutomatedEstimateDisclaimer, parseSupportedLocale } from "./locales.js";

describe("supported output locales", () => {
  it("covers 24 EU official languages and Catalan without duplicate English variants", () => {
    expect(new Set(SUPPORTED_LOCALES).size).toBe(25);
    expect(SUPPORTED_LOCALES).toContain("ga");
    expect(SUPPORTED_LOCALES).toContain("mt");
    expect(SUPPORTED_LOCALES).toContain("ca");
    expect(parseSupportedLocale("en")).toBe("en-GB");
    expect(parseSupportedLocale("en_US")).toBe("en-GB");
    expect(getOutputLanguageName("en-GB")).toBe("British English");
    expect(getOutputLanguageName("pt-BR")).toBe("European Portuguese");
    expect(parseSupportedLocale("es-ES")).toBe("es");
  });
  it.each(["xx", "", "zh", null, "es; ignore safety", "Spanish", 1])("rejects unsupported input rather than silently choosing English: %s", (value) => {
    expect(parseSupportedLocale(value)).toBeNull();
  });
  it.each(SUPPORTED_LOCALES)("has a translated estimate disclaimer for %s", (locale) => {
    expect(getAutomatedEstimateDisclaimer(locale).length).toBeGreaterThan(20);
    if (locale !== "en-GB") expect(getAutomatedEstimateDisclaimer(locale)).not.toBe(getAutomatedEstimateDisclaimer("en-GB"));
  });
});
