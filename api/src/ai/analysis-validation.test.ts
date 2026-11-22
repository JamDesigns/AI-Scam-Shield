import { describe, expect, it } from "vitest";
import { analyzeWithAI, analyzeVideoWithAI, analyzeMediaWithAI } from "../ai.js";
import type { AiProvider } from "./ai-provider.js";
import { SUPPORTED_LOCALES, getOutputLanguageName } from "../locales.js";

const provider = (response: unknown): AiProvider => ({ name: "fixture", requestJson: async <T>() => response as T });
const validText = { riskScore: 95, category: "high_risk", threatType: "bank_phishing", reasons: ["Credentials requested"], explanation: "Do not send credentials." };
const forensics = { aiGeneratedDetected: null, deepfakeDetected: null, maxAiGeneratedScore: null, maxDeepfakeScore: null, maxAiGeneratedAudioScore: null, suspiciousTimestamps: [] };

describe("AI response trust boundary", () => {
  it.each([
    {}, null, [], { ...validText, riskScore: "95" }, { ...validText, riskScore: 95.5 },
    { ...validText, riskScore: -1 }, { ...validText, riskScore: 101 },
    { ...validText, category: "low_risk" }, { ...validText, threatType: "none" },
    { ...validText, reasons: [42] }, { ...validText, reasons: [" "] },
    { ...validText, explanation: "" }, { ...validText, confidence: "certain" },
  ])("rejects malformed or incoherent text response %#", async (response) => {
    await expect(analyzeWithAI({ provider: provider(response), input: "Send credentials", outputLanguage: "en" })).rejects.toMatchObject({ code: "invalid_ai_analysis" });
  });
  it("rejects score 95 with low category in video too", async () => {
    await expect(analyzeVideoWithAI({ provider: provider({ ...validText, category: "low_risk", contentContext: "direct_scam_attempt", deceptiveSolicitation: true, financialInstitutionImpersonation: true }), transcript: "Send credentials", frames: [], forensics, outputLanguage: "en" })).rejects.toMatchObject({ code: "invalid_ai_analysis" });
  });
  it("does not turn an invalid fraud enum into no_clear_signals", async () => {
    let call = 0;
    const responses = [ { authenticity: "inconclusive", confidence: "low", reasons: [], explanation: "Insufficient evidence." }, { fraudAssessment: "definitely_safe", confidence: "high", reasons: [], explanation: "No fraud." } ];
    const fixture: AiProvider = { name: "fixture", requestJson: async <T>() => responses[call++] as T };
    await expect(analyzeMediaWithAI({ provider: fixture, imageBase64: "image", extractedText: "", mediaSignals: "", outputLanguage: "en" })).rejects.toMatchObject({ code: "invalid_ai_analysis", analysisKind: "media fraud" });
  });
  it("preserves a genuine inconclusive fraud assessment and independent authenticity", async () => {
    let call = 0;
    const responses = [ { authenticity: "manipulated_or_synthetic", confidence: "medium", reasons: ["Compositing boundary"], explanation: "Visible compositing." }, { fraudAssessment: "inconclusive", confidence: "low", reasons: [], explanation: "The purpose is unclear." } ];
    const requests: unknown[] = [];
    const fixture: AiProvider = { name: "fixture", requestJson: async <T>(request: unknown) => { requests.push(request); return responses[call++] as T; } };
    const result = await analyzeMediaWithAI({ provider: fixture, imageBase64: "image", extractedText: "OCR", qrContents: ["https://qr.example/pay"], contextText: "Caption", mediaSignals: "", outputLanguage: "ca" });
    expect(result.fraudAssessment).toBe("inconclusive");
    expect(result.authenticity).toBe("manipulated_or_synthetic");
    expect(JSON.stringify(requests)).toContain("https://qr.example/pay");
    expect(JSON.stringify(requests)).toContain("Caption");
    expect(result.disclaimer).toContain("estimació automatitzada");
  });
  it.each(SUPPORTED_LOCALES)("requests the effective output language %s while preserving source input", async (locale) => {
    const requests: Array<{ prompt: string; system?: string }> = [];
    const fixture: AiProvider = { name: "fixture", requestJson: async <T>(request: { prompt: string; system?: string }) => { requests.push(request); return validText as T; } };
    await analyzeWithAI({ provider: fixture, input: "Оригинален текст", outputLanguage: locale });
    expect(requests[0].prompt).toContain("Оригинален текст");
    expect(requests[0].system).toContain(getOutputLanguageName(locale));
  });
  it("lets the offline provider analyse in English while retaining the requested narrative locale", async () => {
    const requests: Array<{system?: string; prompt: string; outputLanguage?: string}> = [];
    const fixture: AiProvider = {name:'local-fixture',generationLanguage:'en-GB',requestJson:async <T>(request: any) => {requests.push(request);return validText as T;}};
    await analyzeWithAI({provider:fixture,input:'Оригинален текст https://evidence.example',outputLanguage:'ga'});
    expect(requests[0].system).toContain('British English');
    expect(requests[0].outputLanguage).toBe('ga');
    expect(requests[0].prompt).toContain('Оригинален текст https://evidence.example');
  });
});
