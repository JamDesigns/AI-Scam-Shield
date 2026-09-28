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

  it("normalizes invalid text AI response values safely", async () => {
    const provider = new TestAiProvider([{
      riskScore: 999,
      category: "critical",
      threatType: "unknown",
      reasons: ["  "],
      explanation: "",
    }]);

    const result = await analyzeWithAI({
      provider,
      input: "Suspicious message",
      outputLanguage: "it",
    });

    expect(result.riskScore).toBe(100);
    expect(result.category).toBe("low_risk");
    expect(result.threatType).toBe("none");
    expect(result.reasons).toEqual([]);
    expect(result.explanation).toBe("No explanation provided.");
  });
});

describe("analyzeImageAuthenticityWithAI", () => {
  it("requests structured image analysis through the configured provider", async () => {
    const provider = new TestAiProvider([{
      category: "likely_ai_generated",
      confidence: "medium",
      reasons: ["Synthetic-looking details"],
      explanation:
        "This image shows some signs that may be AI-generated.",
      disclaimer:
        "This is only an estimate and cannot prove whether the image is authentic.",
    }]);

    const result = await analyzeImageAuthenticityWithAI({
      provider,
      imageSignals: "File name: test-image.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_ai_generated");
    expect(result.confidence).toBe("medium");
    expect(result.reasons).toEqual(["Synthetic-looking details"]);

    expect(provider.requests).toHaveLength(1);

    const request = provider.requests[0];

    expect(request.mode).toBe("conversation");
    expect(request.temperature).toBe(0.1);
    expect(request.media).toEqual([
      {
        dataBase64: "base64-image-content",
        mimeType: "image/jpeg",
      },
    ]);
    expect(request.prompt).toContain("File name: test-image.jpg");
    expect(request.schema.required).toContain("disclaimer");
    expect(request.schema.required).toContain("visualStyle");
    expect(request.schema.required).toContain("contextWarningLevel");
    expect(request.schema.required).toContain("ordinarySceneLikelihood");
    expect(request.schema.required).toContain("artificialSubjectEvidence");
    expect(request.schema.required).toContain("roleContextMismatchLevel");
    expect(request.schema.required).toContain(
      "sensitiveOrFraudContextLevel",
    );

    const properties = request.schema.properties as Record<
      string,
      { enum?: string[] }
    >;

    expect(properties.subjectType.enum).toContain("animal");
    expect(properties.subjectType.enum).toContain(
      "artificial_non_human",
    );
  });

  it("asks for German image output when outputLanguage is de", async () => {
    const provider = new TestAiProvider([{
      category: "inconclusive",
      confidence: "low",
      reasons: ["Nicht genügend Hinweise"],
      explanation:
        "Es gibt nicht genügend Hinweise für eine klare Einschätzung.",
      disclaimer:
        "Dies ist nur eine Schätzung und kann die Echtheit nicht beweisen.",
    }]);

    await analyzeImageAuthenticityWithAI({
      provider,
      imageSignals: "File name: test-image.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "de",
    });

    expect(provider.requests).toHaveLength(1);
    expect(JSON.stringify(provider.requests[0])).toContain("German");
  });

  it("normalizes invalid image AI response values safely", async () => {
    const provider = new TestAiProvider([{
      category: "definitely_fake",
      confidence: "certain",
      reasons: ["  "],
      explanation: "",
      disclaimer: "",
    }]);

    const result = await analyzeImageAuthenticityWithAI({
      provider,
      imageSignals: "File name: test-image.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "it",
    });

    expect(result.category).toBe("inconclusive");
    expect(result.confidence).toBe("low");
    expect(result.reasons).toEqual([]);
    expect(result.explanation).toBe(
      "The analysis could not provide a clear explanation.",
    );
    expect(result.disclaimer).toContain("This is only an estimate");
  });

  it("prefers manipulated when structured signals describe a photographic contextual mismatch", async () => {
    const provider = new TestAiProvider([{
      category: "likely_ai_generated",
      confidence: "high",
      visualStyle: "photographic",
      subjectType: "human",
      contextWarningLevel: "high",
      manipulationLikelihood: "medium",
      generationLikelihood: "low",
      reasons: [
        "Unusual clothing for the visible context",
        "Meme-like staging",
      ],
      explanation:
        "The image looks photographic, but the scene appears staged or out of context.",
      disclaimer:
        "This is only an estimate and cannot prove authenticity.",
    }]);

    const result = await analyzeImageAuthenticityWithAI({
      provider,
      imageSignals: "File name: contextual-mismatch.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_manipulated");
    expect(result.confidence).toBe("medium");
  });

  it("does not classify a real animal scene as AI-generated from weak signals", async () => {
    const provider = new TestAiProvider([{
      category: "likely_ai_generated",
      confidence: "high",
      visualStyle: "synthetic",
      subjectType: "animal",
      contextWarningLevel: "none",
      manipulationLikelihood: "none",
      generationLikelihood: "high",
      reasons: [
        "Low detail due to distance",
        "Small animal subject in an outdoor scene",
      ],
      explanation:
        "The image shows an animal in an ordinary outdoor scene without contextual warning signals.",
      disclaimer:
        "This is only an estimate and cannot prove authenticity.",
    }]);

    const result = await analyzeImageAuthenticityWithAI({
      provider,
      imageSignals: "File name: real-cat.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_authentic");
    expect(result.confidence).toBe("low");
  });

  it("keeps artificial non-human subjects as likely AI-generated", async () => {
    const provider = new TestAiProvider([{
      category: "likely_ai_generated",
      confidence: "high",
      visualStyle: "synthetic",
      subjectType: "artificial_non_human",
      contextWarningLevel: "medium",
      manipulationLikelihood: "low",
      generationLikelihood: "high",
      reasons: [
        "Artificial non-human subject",
        "Synthetic-looking scene",
      ],
      explanation:
        "The image shows an artificial non-human subject in a synthetic-looking scene.",
      disclaimer:
        "This is only an estimate and cannot prove authenticity.",
    }]);

    const result = await analyzeImageAuthenticityWithAI({
      provider,
      imageSignals: "File name: robot.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_ai_generated");
    expect(result.confidence).toBe("high");
  });

  it("keeps ordinary animal scenes as low alert even when the model overstates generation", async () => {
    const provider = new TestAiProvider([{
      category: "likely_ai_generated",
      confidence: "high",
      visualStyle: "synthetic",
      subjectType: "animal",
      contextWarningLevel: "none",
      manipulationLikelihood: "none",
      generationLikelihood: "high",
      ordinarySceneLikelihood: "high",
      artificialSubjectEvidence: "low",
      roleContextMismatchLevel: "none",
      sensitiveOrFraudContextLevel: "none",
      reasons: [
        "Low detail due to distance",
        "Small animal subject in an ordinary outdoor scene",
      ],
      explanation:
        "The image shows an animal in an ordinary outdoor scene without fraud, sensitive items, or role mismatch.",
      disclaimer:
        "This is only an estimate and cannot prove authenticity.",
    }]);

    const result = await analyzeImageAuthenticityWithAI({
      provider,
      imageSignals: "File name: real-cat.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_authentic");
    expect(result.confidence).toBe("low");
  });

  it("normalizes human role-context mismatch to manipulated", async () => {
    const provider = new TestAiProvider([{
      category: "likely_authentic",
      confidence: "high",
      visualStyle: "photographic",
      subjectType: "human",
      contextWarningLevel: "low",
      manipulationLikelihood: "none",
      generationLikelihood: "none",
      ordinarySceneLikelihood: "low",
      artificialSubjectEvidence: "none",
      roleContextMismatchLevel: "high",
      sensitiveOrFraudContextLevel: "none",
      reasons: [
        "Role-inconsistent clothing",
        "Implausible public context",
      ],
      explanation:
        "The image looks photographic, but the human subject appears in a role-inconsistent public context.",
      disclaimer:
        "This is only an estimate and cannot prove authenticity.",
    }]);

    const result = await analyzeImageAuthenticityWithAI({
      provider,
      imageSignals: "File name: public-figure-context.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_manipulated");
    expect(result.confidence).toBe("medium");
  });

  it("normalizes weak AI-generated decisions with no warning signals to low alert", async () => {
    const provider = new TestAiProvider([{
      category: "likely_ai_generated",
      confidence: "low",
      visualStyle: "photographic",
      subjectType: "human",
      contextWarningLevel: "none",
      manipulationLikelihood: "none",
      generationLikelihood: "none",
      ordinarySceneLikelihood: "none",
      artificialSubjectEvidence: "none",
      roleContextMismatchLevel: "none",
      sensitiveOrFraudContextLevel: "none",
      reasons: ["No clear visual warning signals"],
      explanation:
        "The image does not show clear visual or contextual warning signals.",
      disclaimer:
        "This is only an estimate and cannot prove authenticity.",
    }]);

    const result = await analyzeImageAuthenticityWithAI({
      provider,
      imageSignals: "File name: ordinary-scene.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_authentic");
    expect(result.confidence).toBe("low");
  });

  it("rewrites the narrative when a weak AI decision is normalized to authentic", async () => {
    const provider = new TestAiProvider([{
      category: "likely_ai_generated",
      confidence: "low",
      visualStyle: "photographic",
      subjectType: "human",
      contextWarningLevel: "none",
      manipulationLikelihood: "none",
      generationLikelihood: "none",
      ordinarySceneLikelihood: "none",
      artificialSubjectEvidence: "none",
      roleContextMismatchLevel: "none",
      sensitiveOrFraudContextLevel: "none",
      reasons: ["The image could have been generated by AI."],
      explanation:
        "The image could have been generated by AI or digitally manipulated.",
      disclaimer:
        "This is only an estimate and cannot prove authenticity.",
    }]);

    const result = await analyzeImageAuthenticityWithAI({
      provider,
      imageSignals: "File name: ordinary-scene.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "es",
    });

    expect(result.category).toBe("likely_authentic");
    expect(result.confidence).toBe("low");
    expect(result.reasons.join(" ")).toContain("No se");
    expect(result.explanation).toContain("baja alerta");
  });

  it("keeps ordinary photographic object scenes as low alert when only medium manipulation is reported", async () => {
    const provider = new TestAiProvider([{
      category: "likely_manipulated",
      confidence: "medium",
      visualStyle: "photographic",
      subjectType: "object",
      contextWarningLevel: "low",
      manipulationLikelihood: "medium",
      generationLikelihood: "none",
      ordinarySceneLikelihood: "none",
      artificialSubjectEvidence: "none",
      roleContextMismatchLevel: "none",
      sensitiveOrFraudContextLevel: "none",
      reasons: [
        "Perspective looks unusual",
        "Lighting and shadows are not perfectly balanced",
      ],
      explanation:
        "The image may have unusual perspective or lighting, but it shows an ordinary real-world scene without clear manipulation indicators.",
      disclaimer:
        "This is only an estimate and cannot prove authenticity.",
    }]);

    const result = await analyzeImageAuthenticityWithAI({
      provider,
      imageSignals: "File name: ordinary-yard.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_authentic");
    expect(result.confidence).toBe("low");
  });
});

it("forces manipulated_or_synthetic when image forensics is positive even if the visual model says authentic", async () => {
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

  expect(result.authenticity).toBe("manipulated_or_synthetic");
  expect(result.authenticityConfidence).toBe("medium");
  expect(result.authenticityReasons).toEqual([
    "An independent on-device forensic detector found a strong signal consistent with AI-generated imagery.",
  ]);
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
    expect(fraudRequest.prompt).toContain("Extracted text:\n(none)");
    expect(JSON.stringify(fraudRequest)).toContain("Spanish");
  });

  it("normalizes invalid media analysis values safely without decision overrides", async () => {
    const provider = new TestAiProvider([
      {
        authenticity: "definitely_fake",
        confidence: "certain",
        reasons: ["  "],
        explanation: "",
      },
      {
        fraudAssessment: "guaranteed_scam",
        confidence: "certain",
        reasons: null,
        explanation: "",
      },
    ]);

    const result = await analyzeMediaWithAI({
      provider,
      imageBase64: "base64-image-content",
      extractedText: "",
      mediaSignals: "",
      outputLanguage: "it",
    });

    expect(result).toEqual({
      authenticity: "inconclusive",
      authenticityConfidence: "low",
      fraudAssessment: "no_clear_signals",
      fraudConfidence: "low",
      authenticityReasons: [],
      fraudReasons: [],
      explanation:
        "The authenticity assessment could not provide a clear explanation.\n\nThe fraud assessment could not provide a clear explanation.",
      disclaimer:
        "This is an automated estimate and cannot prove authenticity or fraudulent intent with certainty.",
    });
  });
});

describe("analyzeVideoWithAI", () => {
  it("analyzes transcript, sampled frames and forensic evidence together", async () => {
    const provider = new TestAiProvider([{
      riskScore: 82,
      category: "high_risk",
      threatType: "bank_phishing",
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
    expect(request.prompt).toContain("AI-generated detected: true");
    expect(request.prompt).toContain("Deepfake detected: false");
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
      "reasons",
      "explanation",
    ]);
  });

  it("normalizes invalid video AI response values safely", async () => {
    const provider = new TestAiProvider([{
      riskScore: 999,
      category: "critical",
      threatType: "unexpected",
      reasons: ["  ", "Suspicious request"],
      explanation: "",
    }]);

    const result = await analyzeVideoWithAI({
      provider,
      transcript: "",
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

    expect(result).toEqual({
      riskScore: 100,
      category: "low_risk",
      threatType: "none",
      reasons: ["Suspicious request"],
      explanation: "No explanation provided.",
    });

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0].media).toEqual([]);
    expect(provider.requests[0].prompt).toContain(
      "(no recognizable speech)",
    );
    expect(provider.requests[0].prompt).toContain(
      "Suspicious timestamps: none",
    );
  });
});
