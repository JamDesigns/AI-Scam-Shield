import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeImageAuthenticityWithAI,
  analyzeMediaWithAI,
  analyzeWithAI,
} from "./ai.js";

describe("analyzeWithAI", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends text analysis requests to Ollama generate API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          riskScore: 90,
          category: "high_risk",
          threatType: "bank_phishing",
          reasons: ["Urgent banking credential request"],
          explanation: "This looks like a banking phishing attempt.",
        }),
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeWithAI({
      baseUrl: "http://ollama.local",
      model: "llama3.1:8b",
      input: "Your bank account will be blocked. Verify your password now.",
      outputLanguage: "en",
    });

    expect(result.riskScore).toBe(90);
    expect(result.category).toBe("high_risk");
    expect(result.threatType).toBe("bank_phishing");
    expect(result.reasons).toEqual(["Urgent banking credential request"]);

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(url).toBe("http://ollama.local/api/generate");
    expect(body.model).toBe("llama3.1:8b");
    expect(body.prompt).toContain("Your bank account will be blocked");
    expect(body.stream).toBe(false);
    expect(body.format.required).toContain("riskScore");
  });

  it("adds Authorization header when apiKey is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          riskScore: 20,
          category: "low_risk",
          threatType: "none",
          reasons: ["No clear scam signals"],
          explanation: "No strong scam indicators were found.",
        }),
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await analyzeWithAI({
      baseUrl: "http://ollama.local",
      apiKey: "cloud-test-key",
      model: "llama3.1:8b",
      input: "Hello, can we meet tomorrow?",
      outputLanguage: "en",
    });

    const [, request] = fetchMock.mock.calls[0];

    expect(request.headers.Authorization).toBe("Bearer cloud-test-key");
  });

  it("asks for German output when outputLanguage is de", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          riskScore: 20,
          category: "low_risk",
          threatType: "none",
          reasons: ["Keine klaren Betrugssignale"],
          explanation: "Es gibt keine starken Hinweise auf Betrug.",
        }),
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await analyzeWithAI({
      baseUrl: "http://ollama.local",
      model: "llama3.1:8b",
      input: "Hello, can we meet tomorrow?",
      outputLanguage: "de",
    });

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(JSON.stringify(body)).toContain("German");
  });

  it("normalizes invalid text AI response values safely", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          riskScore: 999,
          category: "critical",
          threatType: "unknown",
          reasons: ["  "],
          explanation: "",
        }),
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeWithAI({
      baseUrl: "http://ollama.local",
      model: "llama3.1:8b",
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends imageBase64 to Ollama chat API as message images payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            category: "likely_ai_generated",
            confidence: "medium",
            reasons: ["Synthetic-looking details"],
            explanation:
              "This image shows some signs that may be AI-generated.",
            disclaimer:
              "This is only an estimate and cannot prove whether the image is authentic.",
          }),
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeImageAuthenticityWithAI({
      baseUrl: "http://ollama.local",
      model: "llava:latest",
      imageSignals: "File name: test-image.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_ai_generated");
    expect(result.confidence).toBe("medium");
    expect(result.reasons).toEqual(["Synthetic-looking details"]);

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(url).toBe("http://ollama.local/api/chat");
    expect(body.model).toBe("llava:latest");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].images).toEqual(["base64-image-content"]);
    expect(body.messages[1].content).toContain("File name: test-image.jpg");
    expect(body.format.required).toContain("disclaimer");
    expect(body.format.required).toContain("visualStyle");
    expect(body.format.required).toContain("contextWarningLevel");
    expect(body.format.required).toContain("ordinarySceneLikelihood");
    expect(body.format.required).toContain("artificialSubjectEvidence");
    expect(body.format.required).toContain("roleContextMismatchLevel");
    expect(body.format.required).toContain("sensitiveOrFraudContextLevel");
    expect(body.format.properties.subjectType.enum).toContain("animal");
    expect(body.format.properties.subjectType.enum).toContain(
      "artificial_non_human",
    );
    expect(body.format.properties.subjectType.enum).toContain("animal");
    expect(body.format.properties.subjectType.enum).toContain(
      "artificial_non_human",
    );
  });

  it("asks for German image output when outputLanguage is de", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            category: "inconclusive",
            confidence: "low",
            reasons: ["Nicht genügend Hinweise"],
            explanation:
              "Es gibt nicht genügend Hinweise für eine klare Einschätzung.",
            disclaimer:
              "Dies ist nur eine Schätzung und kann die Echtheit nicht beweisen.",
          }),
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await analyzeImageAuthenticityWithAI({
      baseUrl: "http://ollama.local",
      model: "llava:latest",
      imageSignals: "File name: test-image.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "de",
    });

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(JSON.stringify(body.messages)).toContain("German");
  });

  it("normalizes invalid image AI response values safely", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            category: "definitely_fake",
            confidence: "certain",
            reasons: ["  "],
            explanation: "",
            disclaimer: "",
          }),
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeImageAuthenticityWithAI({
      baseUrl: "http://ollama.local",
      model: "llava:latest",
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
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
          }),
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeImageAuthenticityWithAI({
      baseUrl: "http://ollama.local",
      model: "llava:latest",
      imageSignals: "File name: contextual-mismatch.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_manipulated");
    expect(result.confidence).toBe("medium");
  });

  it("does not classify a real animal scene as AI-generated from weak signals", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
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
          }),
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeImageAuthenticityWithAI({
      baseUrl: "http://ollama.local",
      model: "llava:latest",
      imageSignals: "File name: real-cat.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_authentic");
    expect(result.confidence).toBe("low");
  });

  it("keeps artificial non-human subjects as likely AI-generated", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
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
          }),
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeImageAuthenticityWithAI({
      baseUrl: "http://ollama.local",
      model: "llava:latest",
      imageSignals: "File name: robot.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_ai_generated");
    expect(result.confidence).toBe("high");
  });

  it("keeps ordinary animal scenes as low alert even when the model overstates generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
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
          }),
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeImageAuthenticityWithAI({
      baseUrl: "http://ollama.local",
      model: "llava:latest",
      imageSignals: "File name: real-cat.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_authentic");
    expect(result.confidence).toBe("low");
  });

  it("normalizes human role-context mismatch to manipulated", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
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
          }),
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeImageAuthenticityWithAI({
      baseUrl: "http://ollama.local",
      model: "llava:latest",
      imageSignals: "File name: public-figure-context.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_manipulated");
    expect(result.confidence).toBe("medium");
  });

  it("normalizes weak AI-generated decisions with no warning signals to low alert", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
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
          }),
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeImageAuthenticityWithAI({
      baseUrl: "http://ollama.local",
      model: "llava:latest",
      imageSignals: "File name: ordinary-scene.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_authentic");
    expect(result.confidence).toBe("low");
  });

  it("rewrites the narrative when a weak AI decision is normalized to authentic", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
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
          }),
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeImageAuthenticityWithAI({
      baseUrl: "http://ollama.local",
      model: "llava:latest",
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
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
          }),
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeImageAuthenticityWithAI({
      baseUrl: "http://ollama.local",
      model: "gemma3:4b",
      imageSignals: "File name: ordinary-yard.jpg",
      imageBase64: "base64-image-content",
      outputLanguage: "en",
    });

    expect(result.category).toBe("likely_authentic");
    expect(result.confidence).toBe("low");
  });
});

it("forces manipulated_or_synthetic when image forensics is positive even if the visual model says authentic", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            authenticity: "likely_authentic",
            confidence: "high",
            reasons: ["The image appears visually coherent"],
            explanation: "The image appears authentic.",
          }),
        },
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            fraudAssessment: "no_clear_signals",
            confidence: "low",
            reasons: ["No clear fraud-related content"],
            explanation: "No clear fraud signals were found.",
          }),
        },
      }),
    });

  vi.stubGlobal("fetch", fetchMock);

  const result = await analyzeMediaWithAI({
    baseUrl: "http://ollama.local",
    model: "gemma3:4b",
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

  const [, authenticityRequest] = fetchMock.mock.calls[0];
  const authenticityBody = JSON.parse(authenticityRequest.body);
  const authenticityMessages = JSON.stringify(authenticityBody.messages);

  expect(authenticityMessages).not.toContain("12.638696670532227");
  expect(authenticityMessages).not.toContain("1.359375");
  expect(authenticityMessages).not.toContain("forensic detector");
});

it("keeps high authenticity confidence when image forensics and the visual model strongly agree", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            authenticity: "manipulated_or_synthetic",
            confidence: "high",
            reasons: ["Strong synthetic visual evidence"],
            explanation: "The image appears synthetic.",
          }),
        },
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            fraudAssessment: "no_clear_signals",
            confidence: "medium",
            reasons: [],
            explanation: "No clear fraud signals were found.",
          }),
        },
      }),
    });

  vi.stubGlobal("fetch", fetchMock);

  const result = await analyzeMediaWithAI({
    baseUrl: "http://ollama.local",
    model: "gemma3:4b",
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
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            authenticity: "manipulated_or_synthetic",
            confidence: "medium",
            reasons: ["Visible compositing inconsistencies"],
            explanation: "The image shows signs of visual manipulation.",
          }),
        },
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            fraudAssessment: "possible_fraud",
            confidence: "medium",
            reasons: ["Suspicious financial context"],
            explanation: "Some fraud-related warning signs are present.",
          }),
        },
      }),
    });

  vi.stubGlobal("fetch", fetchMock);

  const result = await analyzeMediaWithAI({
    baseUrl: "http://ollama.local",
    model: "gemma3:4b",
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
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            authenticity: "likely_authentic",
            confidence: "medium",
            reasons: ["No meaningful visual alteration signals"],
            explanation: "The image appears visually coherent.",
          }),
        },
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            fraudAssessment: "strong_fraud_signals",
            confidence: "high",
            reasons: ["The visible message requests account credentials"],
            explanation: "The content contains strong phishing signals.",
          }),
        },
      }),
    });

  vi.stubGlobal("fetch", fetchMock);

  const result = await analyzeMediaWithAI({
    baseUrl: "http://ollama.local",
    model: "gemma3:4b",
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends separate authenticity and fraud multimodal requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              authenticity: "manipulated_or_synthetic",
              confidence: "high",
              reasons: ["Rendered or composited scene"],
              explanation: "The media appears synthetic.",
            }),
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              fraudAssessment: "strong_fraud_signals",
              confidence: "high",
              reasons: [
                "Identity credential and money are linked suspiciously",
              ],
              explanation: "The media contains strong fraud-related context.",
            }),
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMediaWithAI({
      baseUrl: "http://ollama.local",
      model: "gemma3:4b",
      imageBase64: "base64-image-content",
      extractedText: "IDENTITY DOCUMENT",
      mediaSignals: "QR detected: false\nFile name: robot.jpg",
      outputLanguage: "en",
    });

    expect(result.authenticity).toBe("manipulated_or_synthetic");
    expect(result.authenticityConfidence).toBe("high");
    expect(result.fraudAssessment).toBe("strong_fraud_signals");
    expect(result.fraudConfidence).toBe("high");

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [authenticityUrl, authenticityRequest] = fetchMock.mock.calls[0];
    const authenticityBody = JSON.parse(authenticityRequest.body);

    expect(authenticityUrl).toBe("http://ollama.local/api/chat");
    expect(authenticityBody.model).toBe("gemma3:4b");
    expect(authenticityBody.messages[1].images).toEqual([
      "base64-image-content",
    ]);
    expect(authenticityBody.messages[1].content).not.toContain(
      "IDENTITY DOCUMENT",
    );
    expect(authenticityBody.messages[1].content).toContain(
      "File name: robot.jpg",
    );
    expect(authenticityBody.format.required).toEqual(
      expect.arrayContaining([
        "authenticity",
        "confidence",
        "reasons",
        "explanation",
      ]),
    );

    const [fraudUrl, fraudRequest] = fetchMock.mock.calls[1];
    const fraudBody = JSON.parse(fraudRequest.body);

    expect(fraudUrl).toBe("http://ollama.local/api/chat");
    expect(fraudBody.model).toBe("gemma3:4b");
    expect(fraudBody.messages[1].images).toEqual(["base64-image-content"]);
    expect(fraudBody.messages[1].content).toContain("IDENTITY DOCUMENT");
    expect(fraudBody.messages[1].content).toContain("File name: robot.jpg");
    expect(fraudBody.format.required).toEqual(
      expect.arrayContaining([
        "fraudAssessment",
        "confidence",
        "reasons",
        "explanation",
      ]),
    );
  });

  it("keeps authenticity and fraud assessments independent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              authenticity: "manipulated_or_synthetic",
              confidence: "high",
              reasons: ["The scene appears to be a CGI render"],
              explanation: "The image appears synthetic.",
            }),
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              fraudAssessment: "no_clear_signals",
              confidence: "medium",
              reasons: ["No meaningful scam-related context is visible"],
              explanation:
                "The available content does not show clear fraud signals.",
            }),
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMediaWithAI({
      baseUrl: "http://ollama.local",
      model: "gemma3:4b",
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              authenticity: "likely_authentic",
              confidence: "medium",
              reasons: ["No clear signs of visual fabrication"],
              explanation: "The capture itself appears plausible.",
            }),
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              fraudAssessment: "strong_fraud_signals",
              confidence: "high",
              reasons: [
                "The extracted text requests account credentials urgently",
              ],
              explanation:
                "The content contains strong phishing-related signals.",
            }),
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMediaWithAI({
      baseUrl: "http://ollama.local",
      model: "gemma3:4b",
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              authenticity: "inconclusive",
              confidence: "low",
              reasons: ["Not enough reliable authenticity evidence"],
              explanation: "The authenticity assessment is inconclusive.",
            }),
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              fraudAssessment: "possible_fraud",
              confidence: "medium",
              reasons: [
                "Suspicious relationship between visible financial elements",
              ],
              explanation:
                "The visual context contains some fraud-related warning signs.",
            }),
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    await analyzeMediaWithAI({
      baseUrl: "http://ollama.local",
      model: "gemma3:4b",
      imageBase64: "base64-image-content",
      extractedText: "",
      mediaSignals: "File name: shared-image.jpg",
      outputLanguage: "es",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, authenticityRequest] = fetchMock.mock.calls[0];
    const authenticityBody = JSON.parse(authenticityRequest.body);

    expect(authenticityBody.messages[1].images).toEqual([
      "base64-image-content",
    ]);
    expect(authenticityBody.messages[1].content).not.toContain(
      "Extracted text:",
    );
    expect(JSON.stringify(authenticityBody.messages)).toContain("Spanish");

    const [, fraudRequest] = fetchMock.mock.calls[1];
    const fraudBody = JSON.parse(fraudRequest.body);

    expect(fraudBody.messages[1].images).toEqual(["base64-image-content"]);
    expect(fraudBody.messages[1].content).toContain("Extracted text:\n(none)");
    expect(JSON.stringify(fraudBody.messages)).toContain("Spanish");
  });

  it("normalizes invalid media analysis values safely without decision overrides", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              authenticity: "definitely_fake",
              confidence: "certain",
              reasons: ["  "],
              explanation: "",
            }),
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              fraudAssessment: "guaranteed_scam",
              confidence: "certain",
              reasons: null,
              explanation: "",
            }),
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMediaWithAI({
      baseUrl: "http://ollama.local",
      model: "gemma3:4b",
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
