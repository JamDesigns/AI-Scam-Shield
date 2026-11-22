import { describe, expect, it } from "vitest";

import {
  analyzeImageAuthenticityWithAI,
  analyzeMediaWithAI,
  analyzeVideoWithAI,
  analyzeWithAI,
} from "./ai.js";
import type {
  AiProvider,
  AiProviderRequest,
} from "./ai/ai-provider.js";

class TestAiProvider implements AiProvider {
  readonly name = "test";
  readonly requests: AiProviderRequest[] = [];

  private responseIndex = 0;

  constructor(private readonly responses: unknown[]) {}

  async requestJson<T = unknown>(
    params: AiProviderRequest,
  ): Promise<T> {
    this.requests.push(params);

    const response = this.responses[this.responseIndex];

    if (this.responseIndex < this.responses.length - 1) {
      this.responseIndex += 1;
    }

    return response as T;
  }
}

describe("analyzeWithAI", () => {
  it("requests structured text analysis through the configured provider", async () => {
    const provider = new TestAiProvider([{
      riskScore: 90,
      category: "high_risk",
      threatType: "bank_phishing",
      reasons: ["Urgent banking credential request"],
      explanation: "This looks like a banking phishing attempt.",
    }]);

    const result = await analyzeWithAI({
      provider,
      input: "Your bank account will be blocked. Verify your password now.",
      outputLanguage: "en",
    });

    expect(result.riskScore).toBe(90);
    expect(result.category).toBe("high_risk");
    expect(result.threatType).toBe("bank_phishing");
    expect(result.reasons).toEqual([
      "Urgent banking credential request",
    ]);

    expect(provider.requests).toHaveLength(1);

    const request = provider.requests[0];

    expect(request.mode).toBe("completion");
    expect(request.prompt).toContain(
      "Your bank account will be blocked",
    );
    expect(request.temperature).toBe(0.2);
    expect(request.schema.required).toContain("riskScore");
    expect(request.media).toBeUndefined();
  });

  it("asks for German output when outputLanguage is de", async () => {
    const provider = new TestAiProvider([{
      riskScore: 20,
      category: "low_risk",
      threatType: "none",
      reasons: ["Keine klaren Betrugssignale"],
      explanation: "Es gibt keine starken Hinweise auf Betrug.",
    }]);

    await analyzeWithAI({
      provider,
      input: "Hello, can we meet tomorrow?",
      outputLanguage: "de",
    });

    expect(provider.requests).toHaveLength(1);
    expect(
      JSON.stringify(provider.requests[0]),
    ).toContain("German");
  });

  it("rejects invalid text responses instead of inventing a low-risk result", async () => {
    await expect(analyzeWithAI({ provider: new TestAiProvider([{
      riskScore: 999, category: "critical", threatType: "unknown", reasons: [" "], explanation: "",
    }]), input: "Suspicious message", outputLanguage: "it" })).rejects.toThrow("Invalid text analysis response");
  });
});

const validImageResponse = {
  category: "inconclusive", confidence: "low", visualStyle: "photographic", subjectType: "human",
  contextWarningLevel: "none", manipulationLikelihood: "none", generationLikelihood: "none",
  ordinarySceneLikelihood: "low", artificialSubjectEvidence: "none", roleContextMismatchLevel: "none",
  sensitiveOrFraudContextLevel: "none", reasons: ["Insufficient image-level evidence"],
  explanation: "The image cannot be authenticated from this evidence.", disclaimer: "This is only an estimate.",
};

describe("analyzeImageAuthenticityWithAI", () => {
  it("requests and validates all structured image fields", async () => {
    const provider = new TestAiProvider([{ ...validImageResponse, category: "likely_ai_generated", generationLikelihood: "high", confidence: "medium" }]);
    const result = await analyzeImageAuthenticityWithAI({ provider, imageSignals: "File name: test.jpg", imageBase64: "image", outputLanguage: "de" });
    expect(result.category).toBe("likely_ai_generated");
    expect(provider.requests[0].mode).toBe("conversation");
    expect(provider.requests[0].media).toEqual([{ dataBase64: "image", mimeType: "image/jpeg" }]);
    expect(JSON.stringify(provider.requests[0])).toContain("German");
  });
  it("does not convert context-only warnings into image manipulation", async () => {
    const provider = new TestAiProvider([{ ...validImageResponse, contextWarningLevel: "high", roleContextMismatchLevel: "high" }]);
    const result = await analyzeImageAuthenticityWithAI({ provider, imageSignals: "A person in unusual clothes", outputLanguage: "en" });
    expect(result.category).toBe("inconclusive");
  });
  it("does not suppress generation evidence just because the subject is an animal", async () => {
    const provider = new TestAiProvider([{ ...validImageResponse, subjectType: "animal", generationLikelihood: "high", category: "likely_ai_generated" }]);
    expect((await analyzeImageAuthenticityWithAI({ provider, imageSignals: "Animal", outputLanguage: "en" })).category).toBe("likely_ai_generated");
  });
  it.each([{}, { ...validImageResponse, confidence: "certain" }, { ...validImageResponse, reasons: [5] }, { ...validImageResponse, category: "likely_manipulated" }, { ...validImageResponse, category: "likely_authentic", generationLikelihood: "high" }])("rejects incomplete or contradictory image evidence %#", async (response) => {
    await expect(analyzeImageAuthenticityWithAI({ provider: new TestAiProvider([response]), imageSignals: "Image", outputLanguage: "en" })).rejects.toThrow("Invalid image authenticity analysis response");
  });
});

it("does not let an unverified client boolean override the visual assessment", async () => {
  const provider = new TestAiProvider([
    {
      authenticity: "likely_authentic",
      confidence: "high",
      reasons: ["The image appears visually coherent"],
      explanation: "The image appears authentic.",
    },
    {
      fraudAssessment: "no_clear_signals",
      confidence: "low",
      reasons: ["No clear fraud-related content"],
      explanation: "No clear fraud signals were found.",
    },
  ]);

  const result = await analyzeMediaWithAI({
    provider,
    imageBase64: "base64-ai-image",
    extractedText: "",
    mediaSignals: "File name: generated-face.jpg",
    imageForensics: {
      rawLogit: 12.638696670532227,
      threshold: 1.359375,
      isAiGenerated: true,
    },
    outputLanguage: "en",
  });

  expect(result.authenticity).toBe("likely_authentic");
  expect(result.authenticityConfidence).toBe("high");
  expect(provider.requests[0].prompt).toContain("unverified client report");
  expect(result.fraudAssessment).toBe("no_clear_signals");
  expect(result.fraudConfidence).toBe("low");

  expect(provider.requests).toHaveLength(2);

  const authenticityRequest = JSON.stringify(provider.requests[0]);

  expect(authenticityRequest).not.toContain("12.638696670532227");
  expect(authenticityRequest).not.toContain("1.359375");
  expect(authenticityRequest).not.toContain("forensic detector");
});

it("keeps high authenticity confidence when image forensics and the visual model strongly agree", async () => {
  const provider = new TestAiProvider([
    {
      authenticity: "manipulated_or_synthetic",
      confidence: "high",
      reasons: ["Strong synthetic visual evidence"],
      explanation: "The image appears synthetic.",
    },
    {
      fraudAssessment: "no_clear_signals",
      confidence: "medium",
      reasons: [],
      explanation: "No clear fraud signals were found.",
    },
  ]);

  const result = await analyzeMediaWithAI({
    provider,
    imageBase64: "base64-ai-image",
    extractedText: "",
    mediaSignals: "",
    imageForensics: {
      rawLogit: 15.1079740524292,
      threshold: 1.359375,
      isAiGenerated: true,
    },
    outputLanguage: "en",
  });

  expect(result.authenticity).toBe("manipulated_or_synthetic");
  expect(result.authenticityConfidence).toBe("high");
  expect(result.fraudAssessment).toBe("no_clear_signals");
  expect(result.fraudConfidence).toBe("medium");
});

it("does not let a negative forensic result override a visual manipulation assessment", async () => {
  const provider = new TestAiProvider([
    {
      authenticity: "manipulated_or_synthetic",
      confidence: "medium",
      reasons: ["Visible compositing inconsistencies"],
      explanation: "The image shows signs of visual manipulation.",
    },
    {
      fraudAssessment: "possible_fraud",
      confidence: "medium",
      reasons: ["Suspicious financial context"],
      explanation: "Some fraud-related warning signs are present.",
    },
  ]);

  const result = await analyzeMediaWithAI({
    provider,
    imageBase64: "base64-image",
    extractedText: "",
    mediaSignals: "",
    imageForensics: {
      rawLogit: -2.6269383430480957,
      threshold: 1.359375,
      isAiGenerated: false,
    },
    outputLanguage: "en",
  });

  expect(result.authenticity).toBe("manipulated_or_synthetic");
  expect(result.authenticityConfidence).toBe("medium");
  expect(result.authenticityReasons).toEqual([
    "Visible compositing inconsistencies",
  ]);
  expect(result.fraudAssessment).toBe("possible_fraud");
  expect(result.fraudConfidence).toBe("medium");
});

it("preserves the visual authenticity assessment when image forensics is negative", async () => {
  const provider = new TestAiProvider([
    {
      authenticity: "likely_authentic",
      confidence: "medium",
      reasons: ["No meaningful visual alteration signals"],
      explanation: "The image appears visually coherent.",
    },
    {
      fraudAssessment: "strong_fraud_signals",
      confidence: "high",
      reasons: ["The visible message requests account credentials"],
      explanation: "The content contains strong phishing signals.",
    },
  ]);

  const result = await analyzeMediaWithAI({
    provider,
    imageBase64: "base64-real-screenshot",
    extractedText: "Send your password now",
    mediaSignals: "Screenshot image",
    imageForensics: {
      rawLogit: -7.961977481842041,
      threshold: 1.359375,
      isAiGenerated: false,
    },
    outputLanguage: "en",
  });

  expect(result.authenticity).toBe("likely_authentic");
  expect(result.authenticityConfidence).toBe("medium");
  expect(result.authenticityReasons).toEqual([
    "No meaningful visual alteration signals",
  ]);
  expect(result.fraudAssessment).toBe("strong_fraud_signals");
  expect(result.fraudConfidence).toBe("high");
});

describe("analyzeMediaWithAI", () => {
  it("sends separate authenticity and fraud multimodal requests", async () => {
    const provider = new TestAiProvider([
      {
        authenticity: "manipulated_or_synthetic",
        confidence: "high",
        reasons: ["Rendered or composited scene"],
        explanation: "The media appears synthetic.",
      },
      {
        fraudAssessment: "strong_fraud_signals",
        confidence: "high",
        reasons: [
          "Identity credential and money are linked suspiciously",
        ],
        explanation: "The media contains strong fraud-related context.",
      },
    ]);

    const result = await analyzeMediaWithAI({
      provider,
      imageBase64: "base64-image-content",
      extractedText: "IDENTITY DOCUMENT",
      mediaSignals: "QR detected: false\nFile name: robot.jpg",
      outputLanguage: "en",
    });

    expect(result.authenticity).toBe("manipulated_or_synthetic");
    expect(result.authenticityConfidence).toBe("high");
    expect(result.fraudAssessment).toBe("strong_fraud_signals");
    expect(result.fraudConfidence).toBe("high");

    expect(provider.requests).toHaveLength(2);

    const authenticityRequest = provider.requests[0];

    expect(authenticityRequest.mode).toBe("conversation");
    expect(authenticityRequest.temperature).toBe(0.1);
    expect(authenticityRequest.media).toEqual([
      {
        dataBase64: "base64-image-content",
        mimeType: "image/jpeg",
      },
    ]);
    expect(authenticityRequest.prompt).not.toContain(
      "IDENTITY DOCUMENT",
    );
    expect(authenticityRequest.prompt).toContain(
      "File name: robot.jpg",
    );
    expect(authenticityRequest.schema.required).toEqual(
      expect.arrayContaining([
        "authenticity",
        "confidence",
        "reasons",
        "explanation",
      ]),
    );

    const fraudRequest = provider.requests[1];

    expect(fraudRequest.mode).toBe("conversation");
    expect(fraudRequest.temperature).toBe(0.1);
    expect(fraudRequest.media).toEqual([
      {
        dataBase64: "base64-image-content",
        mimeType: "image/jpeg",
      },
    ]);
    expect(fraudRequest.prompt).toContain("IDENTITY DOCUMENT");
    expect(fraudRequest.prompt).toContain("File name: robot.jpg");
    expect(fraudRequest.schema.required).toEqual(
      expect.arrayContaining([
        "fraudAssessment",
        "confidence",
        "reasons",
        "explanation",
      ]),
    );
  });

  it("keeps authenticity and fraud assessments independent", async () => {
    const provider = new TestAiProvider([
      {
        authenticity: "manipulated_or_synthetic",
        confidence: "high",
        reasons: ["The scene appears to be a CGI render"],
        explanation: "The image appears synthetic.",
      },
      {
        fraudAssessment: "no_clear_signals",
        confidence: "medium",
        reasons: ["No meaningful scam-related context is visible"],
        explanation:
          "The available content does not show clear fraud signals.",
      },
    ]);

    const result = await analyzeMediaWithAI({
      provider,
      imageBase64: "base64-promotional-render",
      extractedText: "",
      mediaSignals: "Promotional image",
      outputLanguage: "en",
    });

    expect(result.authenticity).toBe("manipulated_or_synthetic");
    expect(result.authenticityConfidence).toBe("high");
    expect(result.fraudAssessment).toBe("no_clear_signals");
    expect(result.fraudConfidence).toBe("medium");
  });

  for (const [assessment, expected] of [
    ["no_clear_signals", "inconclusive"],
    ["strong_fraud_signals", "strong_fraud_signals"],
  ]) it(`unreadable encrypted contents preserve coverage limits for ${assessment}`, async () => {
    const provider = new TestAiProvider([
      { authenticity: "likely_authentic", confidence: "medium", reasons: ["Simple visible graphic"], explanation: "The visible graphic is plausible." },
      { fraudAssessment: assessment, confidence: "high", reasons: ["Assessment of visible content only"], explanation: "Only the visible content could be evaluated." },
    ]);
    const result = await analyzeMediaWithAI({ provider, imageBase64: "test-image", extractedText: "Community event",
      mediaSignals: "ZIP declares encryption; contents unreadable", hiddenContent: { source: "client_report", encryptedEntriesDeclared: 1 }, outputLanguage: "en" });
    expect(result.fraudAssessment).toBe(expected);
    if (expected === "inconclusive") expect(result.fraudConfidence).toBe("low");
  });

  it("can report strong fraud signals in visually authentic media", async () => {
    const provider = new TestAiProvider([
      {
        authenticity: "likely_authentic",
        confidence: "medium",
        reasons: ["No clear signs of visual fabrication"],
        explanation: "The capture itself appears plausible.",
      },
      {
        fraudAssessment: "strong_fraud_signals",
        confidence: "high",
        reasons: [
          "The extracted text requests account credentials urgently",
        ],
        explanation:
          "The content contains strong phishing-related signals.",
      },
    ]);

    const result = await analyzeMediaWithAI({
      provider,
      imageBase64: "base64-screenshot",
      extractedText: "Your account is blocked. Send your password now.",
      mediaSignals: "Screenshot image",
      outputLanguage: "en",
    });

    expect(result.authenticity).toBe("likely_authentic");
    expect(result.authenticityConfidence).toBe("medium");
    expect(result.fraudAssessment).toBe("strong_fraud_signals");
    expect(result.fraudConfidence).toBe("high");
  });

  it("still analyzes visual content when OCR text is empty", async () => {
    const provider = new TestAiProvider([
      {
        authenticity: "inconclusive",
        confidence: "low",
        reasons: ["Not enough reliable authenticity evidence"],
        explanation: "The authenticity assessment is inconclusive.",
      },
      {
        fraudAssessment: "possible_fraud",
        confidence: "medium",
        reasons: [
          "Suspicious relationship between visible financial elements",
        ],
        explanation:
          "The visual context contains some fraud-related warning signs.",
      },
    ]);

    await analyzeMediaWithAI({
      provider,
      imageBase64: "base64-image-content",
      extractedText: "",
      mediaSignals: "File name: shared-image.jpg",
      outputLanguage: "es",
    });

    expect(provider.requests).toHaveLength(2);

    const authenticityRequest = provider.requests[0];

    expect(authenticityRequest.media).toEqual([
      {
        dataBase64: "base64-image-content",
        mimeType: "image/jpeg",
      },
    ]);
    expect(authenticityRequest.prompt).not.toContain(
      "Extracted text:",
    );
    expect(JSON.stringify(authenticityRequest)).toContain("Spanish");

    const fraudRequest = provider.requests[1];

    expect(fraudRequest.media).toEqual([
      {
        dataBase64: "base64-image-content",
        mimeType: "image/jpeg",
      },
    ]);
    expect(fraudRequest.prompt).toContain("Extracted text (original language):\n(none)");
    expect(JSON.stringify(fraudRequest)).toContain("Spanish");
  });

  it("rejects invalid media output instead of returning no_clear_signals", async () => {
    await expect(analyzeMediaWithAI({ provider: new TestAiProvider([{}, {}]), imageBase64: "image", extractedText: "", mediaSignals: "", outputLanguage: "en" })).rejects.toThrow("Invalid media authenticity analysis response");
  });
});

describe("analyzeVideoWithAI", () => {
  it("analyzes transcript, sampled frames and forensic evidence together", async () => {
    const provider = new TestAiProvider([{
      riskScore: 82,
      category: "high_risk",
      threatType: "bank_phishing",
      contentContext: "direct_scam_attempt",
      deceptiveSolicitation: true,
      financialInstitutionImpersonation: true,
      reasons: [
        "Requests banking credentials",
        "Uses urgent account-blocking language",
      ],
      explanation:
        "The video uses urgent banking impersonation to request sensitive account information.",
    }]);

    const result = await analyzeVideoWithAI({
      provider,
      transcript:
        "Your bank account will be blocked. Send your password now.",
      frames: [
        {
          timestampSeconds: 1,
          dataBase64: "frame-one-base64",
          mimeType: "image/jpeg",
        },
        {
          timestampSeconds: 3,
          dataBase64: "frame-two-base64",
          mimeType: "image/jpeg",
        },
      ],
      forensics: {
        aiGeneratedDetected: true,
        deepfakeDetected: false,
        maxAiGeneratedScore: 0.96,
        maxDeepfakeScore: 0.12,
        maxAiGeneratedAudioScore: null,
        suspiciousTimestamps: [1],
      },
      outputLanguage: "en",
    });

    expect(result).toEqual({
      riskScore: 82,
      category: "high_risk",
      threatType: "bank_phishing",
      reasons: [
        "Requests banking credentials",
        "Uses urgent account-blocking language",
      ],
      explanation:
        "The video uses urgent banking impersonation to request sensitive account information.",
    });

    expect(provider.requests).toHaveLength(1);

    const request = provider.requests[0];

    expect(request.mode).toBe("conversation");
    expect(request.temperature).toBe(0.1);

    expect(request.system).toContain(
      "All user-facing text in reasons and explanation MUST be written exclusively in",
    );
    expect(request.system).toContain(
      "When referring to the overall supplied media, always call it a video, never an image, photo, picture, or frame.",
    );
    expect(request.system).toContain(
      "If the supplied transcript contains recognizable speech, do not state or imply that the video has no audio, no speech, or an absence of audio.",
    );
    expect(request.system).toContain(
      "If the transcript is empty, you may only state that no recognizable speech was transcribed; do not conclude that the video contains no audio.",
    );
    expect(request.system).toContain(
      "Before assigning risk, determine whether the video is itself trying to deceive the viewer",
    );
    expect(request.system).toContain(
      "Educational, awareness, news, documentary, or anti-scam content",
    );
    expect(request.system).toContain(
      "Threat type must describe the threat posed by the video itself",
    );
    expect(request.prompt).toContain(
      "A request for money alone is not bank_phishing",
    );
    expect(request.prompt).toContain(
      "If the video clearly warns about, reports on, reenacts, or explains a scam",
    );
    expect(request.prompt).toContain(
      "Every string in reasons must use the requested output language",
    );

    expect(request.media).toEqual([
      {
        dataBase64: "frame-one-base64",
        mimeType: "image/jpeg",
        filename: "video-frame-1.jpg",
      },
      {
        dataBase64: "frame-two-base64",
        mimeType: "image/jpeg",
        filename: "video-frame-2.jpg",
      },
    ]);

    expect(request.prompt).toContain(
      "Your bank account will be blocked. Send your password now.",
    );
    expect(request.prompt).toContain("Frame 1: 1s");
    expect(request.prompt).toContain("Frame 2: 3s");
    expect(request.prompt).toContain("AI-generated state: detected");
    expect(request.prompt).toContain("Deepfake state: not_detected");
    expect(request.prompt).toContain(
      "Maximum AI-generated score: 0.96",
    );
    expect(request.prompt).toContain(
      "Suspicious timestamps: 1s",
    );

    expect(request.schema.required).toEqual([
      "riskScore",
      "category",
      "threatType",
      "contentContext",
      "deceptiveSolicitation",
      "financialInstitutionImpersonation",
      "reasons",
      "explanation",
    ]);
  });

  it("keeps educational scam-awareness content low risk when there is no deceptive solicitation", async () => {
    const provider = new TestAiProvider([{
      riskScore: 95,
      category: "high_risk",
      threatType: "bank_phishing",
      contentContext: "educational_or_reporting",
      deceptiveSolicitation: false,
      financialInstitutionImpersonation: false,
      reasons: [
        "The video reenacts an emergency scam to warn viewers.",
      ],
      explanation:
        "The video explains how an impersonation scam works.",
    }]);

    const result = await analyzeVideoWithAI({
      provider,
      transcript:
        "This is a warning about scammers pretending to be a family member and asking for bail money.",
      frames: [],
      forensics: {
        aiGeneratedDetected: false,
        deepfakeDetected: false,
        maxAiGeneratedScore: 0.07,
        maxDeepfakeScore: 0,
        maxAiGeneratedAudioScore: 0,
        suspiciousTimestamps: [],
      },
      outputLanguage: "en",
    });

    expect(result.riskScore).toBeLessThan(35);
    expect(result.category).toBe("low_risk");
    expect(result.threatType).toBe("none");
  });

  it("does not classify a money request as bank phishing without financial institution impersonation", async () => {
    const provider = new TestAiProvider([{
      riskScore: 90,
      category: "high_risk",
      threatType: "bank_phishing",
      contentContext: "direct_scam_attempt",
      deceptiveSolicitation: true,
      financialInstitutionImpersonation: false,
      reasons: [
        "An impersonator urgently requests money.",
      ],
      explanation:
        "The video presents a direct impersonation scam requesting money.",
    }]);

    const result = await analyzeVideoWithAI({
      provider,
      transcript:
        "I'm your grandson. I need money for bail right now.",
      frames: [],
      forensics: {
        aiGeneratedDetected: false,
        deepfakeDetected: false,
        maxAiGeneratedScore: null,
        maxDeepfakeScore: null,
        maxAiGeneratedAudioScore: null,
        suspiciousTimestamps: [],
      },
      outputLanguage: "en",
    });

    expect(result.riskScore).toBe(90);
    expect(result.category).toBe("high_risk");
    expect(result.threatType).toBe("unknown_suspicious");
  });

  it("normalizes missing spaces between video explanation sentences", async () => {
    const provider = new TestAiProvider([{
      riskScore: 10,
      category: "low_risk",
      contentContext: "uncertain",
      deceptiveSolicitation: false,
      financialInstitutionImpersonation: false,
      threatType: "none",
      reasons: ["No scam indicators"],
      explanation:
        "No se detectan señales de estafa.Se recomienda mantener precaución.",
    }]);

    const result = await analyzeVideoWithAI({
      provider,
      transcript: "Vídeo de prueba.",
      frames: [],
      forensics: {
        aiGeneratedDetected: false,
        deepfakeDetected: false,
        maxAiGeneratedScore: null,
        maxDeepfakeScore: null,
        maxAiGeneratedAudioScore: null,
        suspiciousTimestamps: [],
      },
      outputLanguage: "es",
    });

    expect(result.explanation).toBe(
      "No se detectan señales de estafa. Se recomienda mantener precaución.",
    );
  });

  it("rejects invalid video output instead of inventing low risk", async () => {
    await expect(analyzeVideoWithAI({ provider: new TestAiProvider([{}]), transcript: "", frames: [], forensics: { aiGeneratedDetected: null, deepfakeDetected: null, maxAiGeneratedScore: null, maxDeepfakeScore: null, maxAiGeneratedAudioScore: null, suspiciousTimestamps: [] }, outputLanguage: "en" })).rejects.toThrow("Invalid video analysis response");
  });
});
