export type RiskCategory = "low_risk" | "medium_risk" | "high_risk";

export type ThreatType =
  | "bank_phishing"
  | "malware"
  | "investment_scam"
  | "fake_support"
  | "account_takeover"
  | "delivery_scam"
  | "crypto_scam"
  | "unknown_suspicious"
  | "none";

export type AiAnalysis = {
  riskScore: number;
  category: RiskCategory;
  threatType: ThreatType;
  reasons: string[];
  explanation: string;
};

export type MediaAuthenticityAssessment =
  | "likely_authentic"
  | "manipulated_or_synthetic"
  | "inconclusive";

export type MediaFraudAssessment =
  | "no_clear_signals"
  | "possible_fraud"
  | "strong_fraud_signals";

export type MediaAnalysisConfidence = "low" | "medium" | "high";

export type MediaAnalysis = {
  authenticity: MediaAuthenticityAssessment;
  authenticityConfidence: MediaAnalysisConfidence;
  fraudAssessment: MediaFraudAssessment;
  fraudConfidence: MediaAnalysisConfidence;
  authenticityReasons: string[];
  fraudReasons: string[];
  explanation: string;
  disclaimer: string;
};

type AnalyzeMediaWithAIParams = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  imageBase64?: string;
  extractedText: string;
  mediaSignals: string;
  imageForensics?: {
    rawLogit: number;
    threshold: number;
    isAiGenerated: boolean;
  };
  outputLanguage: string;
};

export type ImageAuthenticityCategory =
  | "likely_ai_generated"
  | "likely_manipulated"
  | "likely_authentic"
  | "inconclusive";

export type ImageAuthenticityConfidence = "low" | "medium" | "high";

export type ImageAuthenticityAnalysis = {
  category: ImageAuthenticityCategory;
  confidence: ImageAuthenticityConfidence;
  reasons: string[];
  explanation: string;
  disclaimer: string;
};

type ImageAuthenticityVisualStyle =
  | "photographic"
  | "synthetic"
  | "mixed"
  | "unclear";

type ImageAuthenticitySubjectType =
  | "human"
  | "animal"
  | "artificial_non_human"
  | "object"
  | "unclear";

type ImageAuthenticitySignalLevel = "none" | "low" | "medium" | "high";

type ImageAuthenticityDecisionSignals = {
  visualStyle: ImageAuthenticityVisualStyle;
  subjectType: ImageAuthenticitySubjectType;
  contextWarningLevel: ImageAuthenticitySignalLevel;
  manipulationLikelihood: ImageAuthenticitySignalLevel;
  generationLikelihood: ImageAuthenticitySignalLevel;
  ordinarySceneLikelihood: ImageAuthenticitySignalLevel;
  artificialSubjectEvidence: ImageAuthenticitySignalLevel;
  roleContextMismatchLevel: ImageAuthenticitySignalLevel;
  sensitiveOrFraudContextLevel: ImageAuthenticitySignalLevel;
};

type AnalyzeWithAIParams = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  input: string;
  outputLanguage: string;
};

type AnalyzeImageAuthenticityWithAIParams = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  imageSignals: string;
  imageBase64?: string;
  outputLanguage: string;
};

type OllamaGenerateResponse = {
  response?: string;
};

function normalizeOutputLanguage(language: string): string {
  const value = language.trim().toLowerCase();

  if (value === "es") return "Spanish";
  if (value === "fr") return "French";
  if (value === "de") return "German";
  if (value === "it") return "Italian";
  return "English";
}

export async function analyzeWithAI(
  params: AnalyzeWithAIParams,
): Promise<AiAnalysis> {
  const outputLanguage = normalizeOutputLanguage(params.outputLanguage);

  const system = [
    "You are an expert anti-scam analyst.",
    "Your job is to evaluate messages for fraud risk.",
    "Return ONLY valid JSON matching the required schema.",
    "Do not include markdown or extra commentary.",
    "If multiple strong scam signals are present, choose high_risk.",
    "Classify the threat type using only the allowed threatType values.",
    "Use none only when the message is clearly low risk.",
    "Use unknown_suspicious when the message looks suspicious but does not clearly match a specific threat type.",
    "The explanation must be concise (max 3 sentences), clear, and practical.",
    `The explanation must be written in ${outputLanguage}.`,
    `The reasons must also be written in ${outputLanguage}.`,
    "Avoid technical jargon.",
    "Focus on why the message is risky and what the user should do next.",
  ].join(" ");

  const prompt = [
    "Analyze the following message for scam risk.",
    "Return a JSON object with this exact schema:",
    '{ "riskScore": number(0..100), "category": "low_risk"|"medium_risk"|"high_risk", "threatType": "bank_phishing"|"malware"|"investment_scam"|"fake_support"|"account_takeover"|"delivery_scam"|"crypto_scam"|"unknown_suspicious"|"none", "reasons": string[], "explanation": string }',
    "",
    "Threat type definitions:",
    "- bank_phishing: impersonates a bank, payment provider, or financial institution to steal credentials or payment details.",
    "- malware: tries to make the user download, install, open, or execute a suspicious file, app, attachment, or update.",
    "- investment_scam: promises unrealistic profits, trading returns, passive income, or fake investment opportunities.",
    "- fake_support: impersonates customer support, technical support, or a service agent to manipulate the user.",
    "- account_takeover: tries to steal login credentials, verification codes, OTP codes, passwords, or account access.",
    "- delivery_scam: impersonates a courier, delivery service, customs office, or package tracking flow.",
    "- crypto_scam: targets crypto wallets, seed phrases, private keys, exchanges, tokens, or blockchain payments.",
    "- unknown_suspicious: suspicious scam-like content that does not clearly fit the other types.",
    "- none: no meaningful scam pattern detected.",
    "",
    "Rules:",
    "- riskScore must reflect overall fraud probability.",
    "- category must align with riskScore (>=70 high_risk, >=35 medium_risk).",
    "- threatType must be none when category is low_risk unless there is a clear suspicious pattern.",
    "- threatType must not be none when category is medium_risk or high_risk.",
    "- explanation must be short, clear and practical.",
    "- explanation must advise what the user should do.",
    `- explanation must be written in ${outputLanguage}.`,
    `- reasons must be written in ${outputLanguage}.`,
    "- reasons must be short bullet-style phrases, not technical codes.",
    "",
    "Message:",
    params.input,
  ].join("\n");

  const parsed = await requestOllamaJson({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    model: params.model,
    system,
    prompt,
    schema: {
      type: "object",
      properties: {
        riskScore: {
          type: "integer",
          minimum: 0,
          maximum: 100,
        },
        category: {
          type: "string",
          enum: ["low_risk", "medium_risk", "high_risk"],
        },
        threatType: {
          type: "string",
          enum: [
            "bank_phishing",
            "malware",
            "investment_scam",
            "fake_support",
            "account_takeover",
            "delivery_scam",
            "crypto_scam",
            "unknown_suspicious",
            "none",
          ],
        },
        reasons: {
          type: "array",
          items: {
            type: "string",
          },
        },
        explanation: {
          type: "string",
        },
      },
      required: [
        "riskScore",
        "category",
        "threatType",
        "reasons",
        "explanation",
      ],
    },
  });

  const riskScore = clampInt(parsed?.riskScore, 0, 100);
  const category = normalizeCategory(parsed?.category);
  const threatType = normalizeThreatType(parsed?.threatType, category);
  const reasons = normalizeStringList(parsed?.reasons);
  const explanation =
    typeof parsed?.explanation === "string" &&
    parsed.explanation.trim().length > 0
      ? parsed.explanation.trim()
      : "No explanation provided.";

  return { riskScore, category, threatType, reasons, explanation };
}

export async function analyzeImageAuthenticityWithAI(
  params: AnalyzeImageAuthenticityWithAIParams,
): Promise<ImageAuthenticityAnalysis> {
  const outputLanguage = normalizeOutputLanguage(params.outputLanguage);

  const system = [
    "You are an expert digital image authenticity analyst.",
    "Your job is to estimate whether an image may be AI-generated, manipulated, likely authentic, or inconclusive.",
    "Inspect the image visually when image data is provided.",
    "Combine visual inspection with the provided text, metadata, OCR, QR, and visible signals.",
    "Evaluate authenticity using visual evidence, contextual plausibility, and fraud-related scene coherence.",
    "Strong warning signals include physical inconsistencies, distorted anatomy, impossible proportions, inconsistent lighting, impossible shadows, broken perspective, unnatural reflections, malformed text, inconsistent object placement, or visible composition mismatches.",
    "Sensitive-content warning signals include official documents, identity credentials, passports, driver licenses, bank cards, payment cards, legal documents, QR/payment proofs, recovery codes, seed phrases, invoices, bank screens, or similar sensitive items shown in an unnatural, suspicious, staged, impossible, or fraud-like context.",
    "Contextual warning signals include role-inconsistent clothing, exaggerated garments, institutional/public/religious/political/medical/legal/financial/military figures shown in implausible situations, meme-like staging, promotional composition, or scenes designed to look viral, shocking, humorous, or deceptive.",
    "Fraud-context warning signals include money, suitcases, payment cards, banking context, crypto context, investment promises, prizes, delivery/payment claims, support/account recovery themes, identity verification themes, or financial urgency. These are aggravating signals, but they are not required for the image to be suspicious.",
    "Artificial-looking subjects, non-human entities, robots, CGI characters, avatars, mannequins, cartoons, dolls, sculptures, toys, or rendered-looking objects describe what is depicted in the image, not how the image itself was created. Their presence alone is not evidence of AI generation or manipulation.",
    "Do not require obvious pixel artifacts to flag possible manipulation. Contextual contradictions, implausible clothing, sensitive credentials shown out of context, staged scenes, exaggerated proportions, and meme-like composition are also authenticity warning signs.",
    "Do not return likely_authentic with high confidence when the image contains unusual, exaggerated, role-inconsistent, meme-like, humorous, or contextually implausible clothing, objects, posture, scene composition, or subject presentation.",
    "A photo-realistic appearance is not enough to classify an image as likely_authentic. Contextual plausibility must also be considered.",
    "If a public, institutional, religious, political, medical, legal, financial, military, or professional-looking figure appears in an exaggerated, meme-like, role-inconsistent, or implausible situation, treat it as a contextual authenticity warning even if the face, lighting, and background look photographic.",
    "Use likely_authentic only when both the visual appearance and the scene context are coherent and no meaningful warning signals are present.",
    "Use high confidence for likely_authentic only when the image is visually coherent, contextually plausible, and free of meaningful manipulation, generation, staging, meme-like, or fraud-related signals.",
    "Do not guess or infer a person's identity from uncertain visual resemblance. If a public identity is clearly established by visible context or readable text, it may be mentioned; otherwise use generic descriptions such as public figure, religious figure, institutional figure, or professional-looking person.",
    "Do not classify the image as inconclusive when there is clear image-level evidence of AI generation or manipulation. Sensitive credentials, staged presentation, role/context mismatch, fraud-like context, unusual subject matter, or an artificial subject may increase contextual risk, but they do not by themselves rule out inconclusive.",
    "Prefer likely_ai_generated only when the image itself shows generation evidence such as synthetic rendering, inconsistent lighting or shadows, impossible reflections, malformed or inconsistent text, fused or duplicated details, implausible geometry, inconsistent perspective, synthetic textures, or other image-level artifacts. Do not infer AI generation merely because the depicted subject is artificial.",
    "Prefer likely_manipulated when the image looks like a real photo that may have been edited, staged, composited, humorously altered, or presented out of context.",
    "Do not over-specify people, identities, document types, brands, institutions, or exact objects unless they are clearly readable or visually unambiguous. If uncertain, use generic terms such as public figure, institutional figure, religious figure, official document, identity document, sensitive credential, payment card, legal credential, or document shown in the image.",
    "Never claim certainty.",
    "Return ONLY valid JSON matching the required schema.",
    "Do not include markdown or extra commentary.",
    "Use inconclusive when there is not enough image-level evidence to support likely_ai_generated, likely_manipulated, or likely_authentic. Contextual warnings, sensitive or fraud-related content, staging, role/context mismatch, unusual subject matter, or an artificial-looking subject may be reported as context, but they must not prevent an inconclusive authenticity result unless there is also meaningful image-level evidence of generation or manipulation.",
    "The explanation must be concise (max 3 sentences), clear, and practical.",
    `The explanation must be written in ${outputLanguage}.`,
    `The reasons and disclaimer must also be written in ${outputLanguage}.`,
    "Avoid technical jargon.",
  ].join(" ");

  const prompt = [
    "Analyze the following image for authenticity risk.",
    "Return a JSON object with this exact schema:",
    '{ "category": "likely_ai_generated"|"likely_manipulated"|"likely_authentic"|"inconclusive", "confidence": "low"|"medium"|"high", "visualStyle": "photographic"|"synthetic"|"mixed"|"unclear", "subjectType": "human"|"animal"|"artificial_non_human"|"object"|"unclear", "contextWarningLevel": "none"|"low"|"medium"|"high", "manipulationLikelihood": "none"|"low"|"medium"|"high", "generationLikelihood": "none"|"low"|"medium"|"high", "ordinarySceneLikelihood": "none"|"low"|"medium"|"high", "artificialSubjectEvidence": "none"|"low"|"medium"|"high", "roleContextMismatchLevel": "none"|"low"|"medium"|"high", "sensitiveOrFraudContextLevel": "none"|"low"|"medium"|"high", "reasons": string[], "explanation": string, "disclaimer": string }',
    "",
    "Category definitions:",
    "- likely_ai_generated: the signals suggest the image itself may have been generated by AI.",
    "- likely_manipulated: the signals suggest the image may have been edited, altered, composited, staged, or presented out of context.",
    "- likely_authentic: the signals do not show meaningful signs of AI generation or manipulation.",
    "- inconclusive: there is not enough evidence to make a useful estimate.",
    "",
    "Internal structured fields:",
    "- visualStyle must describe the overall appearance of the image: photographic, synthetic, mixed, or unclear.",
    "- subjectType must describe the main depicted subject: human, animal, artificial_non_human, object, or unclear.",
    "- contextWarningLevel must describe only how unusual, implausible, staged, meme-like, misleading, or suspicious the depicted scene or narrative appears. It describes contextual risk, not image alteration. A medium or high contextWarningLevel alone must not be treated as evidence that the image was AI-generated or manipulated.",
    "- manipulationLikelihood must estimate only whether the image itself shows visual evidence of editing, compositing, retouching, object insertion or removal, altered proportions, inconsistent boundaries, blending artifacts, or other image-level alteration. Staging, unusual subject matter, fraud-related context, implausible narrative, or out-of-context presentation alone must not increase manipulationLikelihood.",
    "- generationLikelihood must estimate whether the image itself shows evidence of AI generation, rendering, CGI, or synthetic image creation. The depicted subject being artificial is not evidence by itself that the image was AI-generated.",
    "- ordinarySceneLikelihood must estimate whether the image looks like an ordinary real-world scene without meaningful authenticity warnings.",
    "- artificialSubjectEvidence must describe only whether the main depicted subject appears artificial, robotic, CGI-like, rendered, doll-like, mannequin-like, avatar-like, or otherwise non-natural. It describes the subject, not the authenticity of the image.",
    "- roleContextMismatchLevel applies only when subjectType is human. It must be none for animal, artificial_non_human, object, or unclear. For human subjects, it must estimate whether clothing, posture, scene, or role context is implausible, meme-like, staged, exaggerated, or inconsistent with the visible setting.",
    "- sensitiveOrFraudContextLevel must describe only whether the depicted content contains sensitive, financial, identity-related, payment-related, investment-related, credential-related, or fraud-like context. It describes scam or sensitivity context, not image authenticity. A medium or high sensitiveOrFraudContextLevel alone must not be treated as evidence that the image was AI-generated or manipulated.",
    "- For human subjects, oversized or exaggerated clothing, unusual posture, strange public setting, institutional/religious/professional-looking role cues in an implausible casual scene, or meme-like composition may increase roleContextMismatchLevel.",
    "- For human subjects, if roleContextMismatchLevel is medium or high, contextWarningLevel should also normally be medium or high.",
    "- If category is likely_ai_generated, generationLikelihood must be medium or high. artificialSubjectEvidence alone is never sufficient.",
    "- If category is likely_manipulated, manipulationLikelihood must be medium or high. contextWarningLevel, roleContextMismatchLevel, and sensitiveOrFraudContextLevel may provide supporting context, but they must not justify likely_manipulated by themselves.",
    "- Do not classify a photographic human scene as likely_ai_generated when generationLikelihood is none or low. Use likely_manipulated for meaningful contextual or editing signals, or likely_authentic/inconclusive when there are no meaningful warning signals.",
    "- Use animal for real animals, pets, wildlife, or natural creatures.",
    "- Use artificial_non_human only for robots, avatars, mannequins, CGI characters, cartoons, dolls, synthetic entities, sculptures, toys, or clearly artificial subjects.",
    "- A real photograph may contain a robot, mannequin, doll, sculpture, toy, avatar, screen image, or other artificial subject. Do not infer that the image itself is AI-generated merely because its subject is artificial.",
    "- Low detail, distance, compression, blur, low resolution, or a small subject in the scene are not enough by themselves to classify an image as AI-generated or manipulated.",
    "- Ordinary scenes without fraud, sensitive items, role mismatch, editing evidence, or generation evidence should not be classified as AI-generated only because of low detail, compression, shadows, reflections, or camera quality.",
    "- These internal fields must always use the exact English enum values, regardless of the requested response language.",
    "- reasons, explanation, and disclaimer must be written in the requested response language.",
    "",
    "Rules:",
    "- Never state that the image is definitely real, fake, AI-generated, or manipulated.",
    "- Use low confidence when signals are weak, ambiguous, or mostly textual.",
    "- Use medium confidence when there is at least one strong image-level contradiction or several consistent generation/manipulation signals.",
    "- Use high confidence only when several strong and consistent image-level signals support the same conclusion.",
    "- An artificial-looking subject alone must never increase confidence that the image itself was AI-generated or manipulated.",
    "- If the image contains sensitive credentials, official documents, payment elements, identity-related items, or financial/fraud-like context in an unnatural, impossible, staged, or suspicious scene, do not return inconclusive unless the image is too unclear to inspect.",
    "- If the image shows a public, institutional, religious, political, medical, legal, financial, military, or professional-looking figure in an implausible, exaggerated, humorous, role-inconsistent, or meme-like situation, treat that as a contextual authenticity warning, not automatically as AI-generation evidence.",
    "- Prefer likely_ai_generated only when the image itself contains image-level generation evidence such as inconsistent lighting or shadows, impossible reflections, malformed or inconsistent text, fused or duplicated details, implausible geometry, rendering artifacts, inconsistent perspective, synthetic textures, or other visual inconsistencies that suggest synthetic image creation.",
    "- The category or nature of the depicted subject itself, such as robot, mannequin, doll, avatar, animal, or human, must never be used alone as evidence that the image was AI-generated.",
    "- Prefer likely_manipulated only when the image itself shows medium or high visual evidence of alteration, such as suspicious edits, compositing, inserted or removed elements, inconsistent boundaries, blending artifacts, altered proportions, or other image-level manipulation. Role/context mismatch, unusual staging, suspicious subject matter, or misleading presentation may support the assessment but must not establish manipulation without image-level evidence.",
    "- Use likely_authentic only when the image looks visually coherent and lacks meaningful manipulation, generation, fraud, or contextual warning signals.",
    "- Use generic descriptions when uncertain. Do not over-specify a document, object, institution, brand, or person unless that detail is visually clear or established by readable context.",
    "- Reasons must be short bullet-style phrases describing observable evidence in the image.",
    "- Do not use the subject category itself, such as robotic subject, robot, mannequin, doll, avatar, animal, or human, as an authenticity reason.",
    "- For likely_ai_generated, reasons must focus on image-level evidence such as lighting, shadows, reflections, geometry, text, textures, perspective, composition, duplicated details, or rendering inconsistencies.",
    "- For likely_manipulated, reasons must focus on observable editing, compositing, proportion, context, staging, or presentation inconsistencies.",
    "- Explanation must connect the observable evidence to the final category and explain the estimate in clear, probabilistic language.",
    "- Do not claim or imply that an image is artificial merely because it depicts an artificial subject. Explain which properties of the image itself support the estimate.",
    "- Disclaimer must clearly say that this is only an estimate and cannot prove authenticity.",
    `- explanation must be written in ${outputLanguage}.`,
    `- reasons must be written in ${outputLanguage}.`,
    `- disclaimer must be written in ${outputLanguage}.`,
    "",
    "Image signals:",
    params.imageSignals,
  ].join("\n");

  const parsed = await requestOllamaChatJson({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    model: params.model,
    system,
    prompt,
    imageBase64: params.imageBase64,
    schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "likely_ai_generated",
            "likely_manipulated",
            "likely_authentic",
            "inconclusive",
          ],
        },
        confidence: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
        visualStyle: {
          type: "string",
          enum: ["photographic", "synthetic", "mixed", "unclear"],
        },
        subjectType: {
          type: "string",
          enum: [
            "human",
            "animal",
            "artificial_non_human",
            "object",
            "unclear",
          ],
        },
        contextWarningLevel: {
          type: "string",
          enum: ["none", "low", "medium", "high"],
        },
        manipulationLikelihood: {
          type: "string",
          enum: ["none", "low", "medium", "high"],
        },
        generationLikelihood: {
          type: "string",
          enum: ["none", "low", "medium", "high"],
        },
        ordinarySceneLikelihood: {
          type: "string",
          enum: ["none", "low", "medium", "high"],
        },
        artificialSubjectEvidence: {
          type: "string",
          enum: ["none", "low", "medium", "high"],
        },
        roleContextMismatchLevel: {
          type: "string",
          enum: ["none", "low", "medium", "high"],
        },
        sensitiveOrFraudContextLevel: {
          type: "string",
          enum: ["none", "low", "medium", "high"],
        },
        reasons: {
          type: "array",
          items: {
            type: "string",
          },
        },
        explanation: {
          type: "string",
        },
        disclaimer: {
          type: "string",
        },
      },
      required: [
        "category",
        "confidence",
        "visualStyle",
        "subjectType",
        "contextWarningLevel",
        "manipulationLikelihood",
        "generationLikelihood",
        "ordinarySceneLikelihood",
        "artificialSubjectEvidence",
        "roleContextMismatchLevel",
        "sensitiveOrFraudContextLevel",
        "reasons",
        "explanation",
        "disclaimer",
      ],
    },
  });

  const initialCategory = normalizeImageAuthenticityCategory(parsed?.category);
  const initialConfidence = normalizeImageAuthenticityConfidence(
    parsed?.confidence,
  );
  const decisionSignals: ImageAuthenticityDecisionSignals = {
    visualStyle: normalizeImageAuthenticityVisualStyle(parsed?.visualStyle),
    subjectType: normalizeImageAuthenticitySubjectType(parsed?.subjectType),
    contextWarningLevel: normalizeImageAuthenticitySignalLevel(
      parsed?.contextWarningLevel,
    ),
    manipulationLikelihood: normalizeImageAuthenticitySignalLevel(
      parsed?.manipulationLikelihood,
    ),
    generationLikelihood: normalizeImageAuthenticitySignalLevel(
      parsed?.generationLikelihood,
    ),
    ordinarySceneLikelihood: normalizeImageAuthenticitySignalLevel(
      parsed?.ordinarySceneLikelihood,
    ),
    artificialSubjectEvidence: normalizeImageAuthenticitySignalLevel(
      parsed?.artificialSubjectEvidence,
    ),
    roleContextMismatchLevel: normalizeImageAuthenticitySignalLevel(
      parsed?.roleContextMismatchLevel,
    ),
    sensitiveOrFraudContextLevel: normalizeImageAuthenticitySignalLevel(
      parsed?.sensitiveOrFraudContextLevel,
    ),
  };
  const reasons = normalizeStringList(parsed?.reasons);
  const explanation =
    typeof parsed?.explanation === "string" &&
    parsed.explanation.trim().length > 0
      ? parsed.explanation.trim()
      : "The analysis could not provide a clear explanation.";
  const disclaimer =
    typeof parsed?.disclaimer === "string" &&
    parsed.disclaimer.trim().length > 0
      ? parsed.disclaimer.trim()
      : "This is only an estimate and cannot prove whether an image is authentic, AI-generated, or manipulated.";

  console.info(
    JSON.stringify({
      event: "image_authenticity_decision_signals",
      initialCategory,
      initialConfidence,
      decisionSignals,
    }),
  );

  const decision = normalizeImageAuthenticityDecision({
    category: initialCategory,
    confidence: initialConfidence,
    signals: decisionSignals,
  });

  const narrative = normalizeImageAuthenticityNarrative({
    initialCategory,
    finalCategory: decision.category,
    decisionSignals,
    reasons,
    explanation,
    outputLanguage: params.outputLanguage,
  });

  return {
    category: decision.category,
    confidence: decision.confidence,
    reasons: narrative.reasons,
    explanation: narrative.explanation,
    disclaimer,
  };
}

function normalizeImageAuthenticityNarrative(params: {
  initialCategory: ImageAuthenticityCategory;
  finalCategory: ImageAuthenticityCategory;
  decisionSignals: ImageAuthenticityDecisionSignals;
  reasons: string[];
  explanation: string;
  outputLanguage: string;
}): {
  reasons: string[];
  explanation: string;
} {
  if (params.finalCategory === "likely_authentic") {
    return getLikelyAuthenticNarrative(params.outputLanguage);
  }

  if (params.initialCategory === params.finalCategory) {
    return {
      reasons: params.reasons,
      explanation: params.explanation,
    };
  }

  return {
    reasons: params.reasons,
    explanation: params.explanation,
  };
}

function getLikelyAuthenticNarrative(outputLanguage: string): {
  reasons: string[];
  explanation: string;
} {
  const language = normalizeNarrativeOutputLanguage(outputLanguage);

  if (language === "es") {
    return {
      reasons: [
        "No se han detectado señales visuales fuertes de alerta.",
        "No se aprecian indicios claros de manipulación, fraude o generación por IA en el contexto disponible de la imagen.",
      ],
      explanation:
        "La valoración final se ha ajustado a un resultado de baja alerta porque las señales estructuradas no respaldan una clasificación clara como generada por IA o manipulada.",
    };
  }

  if (language === "fr") {
    return {
      reasons: [
        "Aucun signal visuel fort d’alerte n’a été détecté.",
        "Aucun indice clair de manipulation, de fraude ou de génération par IA n’a été identifié dans le contexte disponible de l’image.",
      ],
      explanation:
        "L’évaluation finale a été ajustée vers un résultat de faible alerte, car les signaux structurés ne justifient pas une classification claire comme image générée par IA ou manipulée.",
    };
  }

  if (language === "de") {
    return {
      reasons: [
        "Es wurden keine starken visuellen Warnsignale erkannt.",
        "Im verfügbaren Bildkontext wurden keine klaren Hinweise auf Manipulation, Betrug oder KI-Erzeugung festgestellt.",
      ],
      explanation:
        "Die endgültige Einschätzung wurde auf eine niedrige Warnstufe angepasst, da die strukturierten Signale keine klare Einstufung als KI-generiert oder manipuliert stützen.",
    };
  }

  if (language === "it") {
    return {
      reasons: [
        "Non sono stati rilevati segnali visivi forti di allerta.",
        "Nel contesto disponibile dell’immagine non emergono indizi chiari di manipolazione, frode o generazione tramite IA.",
      ],
      explanation:
        "La valutazione finale è stata adattata a un risultato di bassa allerta perché i segnali strutturati non supportano una classificazione chiara come immagine generata da IA o manipolata.",
    };
  }

  return {
    reasons: [
      "No strong visual warning signals were detected.",
      "No clear evidence of manipulation, fraud, or AI generation was found in the available image context.",
    ],
    explanation:
      "The final estimate was adjusted to a low-alert result because the structured signals did not support a clear AI-generated or manipulated classification.",
  };
}

function normalizeNarrativeOutputLanguage(outputLanguage: string): string {
  const language = outputLanguage.toLowerCase();

  if (language.startsWith("es") || language.includes("spanish")) return "es";
  if (language.startsWith("fr") || language.includes("french")) return "fr";
  if (language.startsWith("de") || language.includes("german")) return "de";
  if (language.startsWith("it") || language.includes("italian")) return "it";

  return "en";
}

export async function analyzeMediaWithAI(
  params: AnalyzeMediaWithAIParams,
): Promise<MediaAnalysis> {
  const outputLanguage = normalizeOutputLanguage(params.outputLanguage);

  const authenticitySystem = [
    "You are a multimodal image integrity analyst.",
    "Assess only the visual integrity and origin of the supplied image.",
    "Determine whether there is observable evidence that the image or its visible content has been materially generated, composited, edited, or altered.",
    "A digital photograph or screenshot can be authentic.",
    "Do not use image resolution, file format, digital origin, screenshot status, missing metadata, or lack of contextual information as evidence either for or against authenticity.",
    "Synthetic or rendered content may be identified as synthetic only when observable visual evidence or other valid media signals support that conclusion.",
    "Do not assess fraud, trustworthiness, intent, or whether the depicted message or claim is true.",
    "Base the assessment only on observable visual evidence and supplied media signals.",
    "If the evidence is insufficient, reflect that uncertainty in the assessment and confidence.",
    "Return ONLY valid JSON matching the required schema.",
    "Do not include markdown or extra commentary.",
    `Write reasons and explanation in ${outputLanguage}.`,
  ].join(" ");

  const authenticityPrompt = [
    "Assess the visual integrity and origin of the supplied image.",
    "",
    "Is there observable evidence that the image or its visible content has been materially generated, composited, edited, or altered, or does it appear to be an unaltered representation of its source?",
    "",
    `Media signals:\n${params.mediaSignals || "(none)"}`,
    "",
    "Return a JSON object with this exact schema:",
    '{ "authenticity": "likely_authentic"|"manipulated_or_synthetic"|"inconclusive", "confidence": "low"|"medium"|"high", "reasons": string[], "explanation": string }',
  ].join("\n");

  const fraudSystem = [
    "You are a multimodal fraud and deception analyst.",
    "Assess only whether the supplied content provides evidence of fraud or deception.",
    "Consider the visible content together with extracted text and supplied information.",
    "Do not assess or discuss whether the media file itself is authentic, genuine, fake, synthetic, rendered, edited, falsified, or manipulated.",
    "Image manipulation or synthetic origin is not by itself evidence of fraud.",
    "Reasons and explanations must refer only to fraud, deception, impersonation, scam indicators, credential theft, financial manipulation, misleading claims, or other deceptive intent visible in the content.",
    "Base the assessment only on observable evidence.",
    "If the evidence is insufficient, reflect that uncertainty in the assessment and confidence.",
    "Return ONLY valid JSON matching the required schema.",
    "Do not include markdown or extra commentary.",
    `Write reasons and explanation in ${outputLanguage}.`,
  ].join(" ");

  const fraudPrompt = [
    "Assess the supplied media for fraud or deception.",
    "",
    "Does the content, including the relationships between what is visible and any extracted or supplied information, provide evidence of fraud or deception?",
    "",
    "Do not discuss image authenticity, genuineness, manipulation, editing, falsification, or synthetic origin in the response.",
    "",
    "Return a JSON object with this exact schema:",
    '{ "fraudAssessment": "no_clear_signals"|"possible_fraud"|"strong_fraud_signals", "confidence": "low"|"medium"|"high", "reasons": string[], "explanation": string }',
    "",
    `Extracted text:\n${params.extractedText || "(none)"}`,
    "",
    `Media signals:\n${params.mediaSignals || "(none)"}`,
  ].join("\n");

  const [authenticityParsed, fraudParsed] = await Promise.all([
    requestOllamaChatJson({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      model: params.model,
      system: authenticitySystem,
      prompt: authenticityPrompt,
      imageBase64: params.imageBase64,
      schema: {
        type: "object",
        properties: {
          authenticity: {
            type: "string",
            enum: [
              "likely_authentic",
              "manipulated_or_synthetic",
              "inconclusive",
            ],
          },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          reasons: {
            type: "array",
            items: { type: "string" },
          },
          explanation: {
            type: "string",
          },
        },
        required: ["authenticity", "confidence", "reasons", "explanation"],
      },
    }),
    requestOllamaChatJson({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      model: params.model,
      system: fraudSystem,
      prompt: fraudPrompt,
      imageBase64: params.imageBase64,
      schema: {
        type: "object",
        properties: {
          fraudAssessment: {
            type: "string",
            enum: [
              "no_clear_signals",
              "possible_fraud",
              "strong_fraud_signals",
            ],
          },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          reasons: {
            type: "array",
            items: { type: "string" },
          },
          explanation: {
            type: "string",
          },
        },
        required: ["fraudAssessment", "confidence", "reasons", "explanation"],
      },
    }),
  ]);

  const normalizedAuthenticity = normalizeMediaAuthenticityAssessment(
    authenticityParsed?.authenticity,
  );

  const normalizedAuthenticityConfidence = normalizeMediaAnalysisConfidence(
    authenticityParsed?.confidence,
  );

  const normalizedAuthenticityReasons = normalizeStringList(
    authenticityParsed?.reasons,
  );

  const forensicAiGenerated = params.imageForensics?.isAiGenerated === true;

  const finalAuthenticity = forensicAiGenerated
    ? "manipulated_or_synthetic"
    : normalizedAuthenticity;

  const finalAuthenticityConfidence = forensicAiGenerated
    ? normalizedAuthenticity === "manipulated_or_synthetic" &&
      normalizedAuthenticityConfidence === "high"
      ? "high"
      : "medium"
    : normalizedAuthenticityConfidence;

  const finalAuthenticityReasons = forensicAiGenerated
    ? [
        "An independent on-device forensic detector found a strong signal consistent with AI-generated imagery.",
      ]
    : normalizedAuthenticityReasons;

  const authenticityExplanation = forensicAiGenerated
    ? "An independent on-device forensic detector found a strong signal consistent with AI-generated imagery. The image is therefore classified as manipulated or synthetic. This automated screening result is not definitive proof."
    : typeof authenticityParsed?.explanation === "string" &&
        authenticityParsed.explanation.trim().length > 0
      ? authenticityParsed.explanation.trim()
      : "The authenticity assessment could not provide a clear explanation.";

  const fraudExplanation =
    typeof fraudParsed?.explanation === "string" &&
    fraudParsed.explanation.trim().length > 0
      ? fraudParsed.explanation.trim()
      : "The fraud assessment could not provide a clear explanation.";

  return {
    authenticity: finalAuthenticity,
    authenticityConfidence: finalAuthenticityConfidence,
    fraudAssessment: normalizeMediaFraudAssessment(
      fraudParsed?.fraudAssessment,
    ),
    fraudConfidence: normalizeMediaAnalysisConfidence(fraudParsed?.confidence),
    authenticityReasons: finalAuthenticityReasons,
    fraudReasons: normalizeStringList(fraudParsed?.reasons),
    explanation: `${authenticityExplanation}\n\n${fraudExplanation}`,
    disclaimer:
      "This is an automated estimate and cannot prove authenticity or fraudulent intent with certainty.",
  };
}

async function requestOllamaChatJson(params: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  system?: string;
  prompt: string;
  imageBase64?: string;
  schema: Record<string, unknown>;
}): Promise<any> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (params.apiKey && params.apiKey.trim().length > 0) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  const messages = [
    ...(params.system
      ? [
          {
            role: "system",
            content: params.system,
          },
        ]
      : []),
    {
      role: "user",
      content: params.prompt,
      ...(params.imageBase64 ? { images: [params.imageBase64] } : {}),
    },
  ];

  const res = await fetch(`${params.baseUrl}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: params.model,
      messages,
      stream: false,
      format: params.schema,
      options: {
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}): ${txt}`);
  }

  const json = (await res.json()) as {
    message?: {
      content?: string;
    };
  };

  const content = json.message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("AI returned empty content");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new Error("AI response was not valid JSON");
  }
}

async function requestOllamaJson(params: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  system?: string;
  prompt: string;
  imageBase64?: string;
  schema: Record<string, unknown>;
}): Promise<any> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (params.apiKey && params.apiKey.trim().length > 0) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  const res = await fetch(`${params.baseUrl}/api/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: params.model,
      ...(params.system ? { system: params.system } : {}),
      prompt: params.prompt,
      ...(params.imageBase64 ? { images: [params.imageBase64] } : {}),
      stream: false,
      format: params.schema,
      options: {
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}): ${txt}`);
  }

  const json = (await res.json()) as OllamaGenerateResponse;
  const content = json?.response;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("AI returned empty content");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new Error("AI response was not valid JSON");
  }
}

function normalizeMediaAuthenticityAssessment(
  value: unknown,
): MediaAuthenticityAssessment {
  const normalized = String(value ?? "").toLowerCase();

  if (normalized === "likely_authentic") return "likely_authentic";
  if (normalized === "manipulated_or_synthetic") {
    return "manipulated_or_synthetic";
  }

  return "inconclusive";
}

function normalizeMediaFraudAssessment(value: unknown): MediaFraudAssessment {
  const normalized = String(value ?? "").toLowerCase();

  if (normalized === "strong_fraud_signals") return "strong_fraud_signals";
  if (normalized === "possible_fraud") return "possible_fraud";

  return "no_clear_signals";
}

function normalizeMediaAnalysisConfidence(
  value: unknown,
): MediaAnalysisConfidence {
  const normalized = String(value ?? "").toLowerCase();

  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";

  return "low";
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) =>
          String(item)
            .replace(/^reasons\./i, "")
            .trim(),
        )
        .filter((item) => item.length > 0)
        .slice(0, 10)
    : [];
}

function clampInt(v: any, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  const i = Math.round(n);
  return Math.max(min, Math.min(max, i));
}

function normalizeCategory(v: any): RiskCategory {
  const s = String(v ?? "").toLowerCase();
  if (s === "high_risk") return "high_risk";
  if (s === "medium_risk") return "medium_risk";
  return "low_risk";
}

function normalizeThreatType(v: any, category: RiskCategory): ThreatType {
  const s = String(v ?? "").toLowerCase();

  if (s === "bank_phishing") return "bank_phishing";
  if (s === "malware") return "malware";
  if (s === "investment_scam") return "investment_scam";
  if (s === "fake_support") return "fake_support";
  if (s === "account_takeover") return "account_takeover";
  if (s === "delivery_scam") return "delivery_scam";
  if (s === "crypto_scam") return "crypto_scam";
  if (s === "unknown_suspicious") return "unknown_suspicious";
  if (s === "none" && category === "low_risk") return "none";

  return category === "low_risk" ? "none" : "unknown_suspicious";
}

function normalizeImageAuthenticityDecision(params: {
  category: ImageAuthenticityCategory;
  confidence: ImageAuthenticityConfidence;
  signals: ImageAuthenticityDecisionSignals;
}): {
  category: ImageAuthenticityCategory;
  confidence: ImageAuthenticityConfidence;
} {
  const hasContextWarning = isMediumOrHighSignal(
    params.signals.contextWarningLevel,
  );
  const hasManipulationSignal = isMediumOrHighSignal(
    params.signals.manipulationLikelihood,
  );
  const hasGenerationSignal = isMediumOrHighSignal(
    params.signals.generationLikelihood,
  );
  const hasOrdinarySceneSignal = isMediumOrHighSignal(
    params.signals.ordinarySceneLikelihood,
  );
  const hasArtificialSubjectEvidence = isMediumOrHighSignal(
    params.signals.artificialSubjectEvidence,
  );
  const hasRoleContextMismatch = isMediumOrHighSignal(
    params.signals.roleContextMismatchLevel,
  );
  const hasSensitiveOrFraudContext = isMediumOrHighSignal(
    params.signals.sensitiveOrFraudContextLevel,
  );

  const hasAnyContextualRisk =
    hasContextWarning ||
    hasManipulationSignal ||
    hasRoleContextMismatch ||
    hasSensitiveOrFraudContext;

  const hasNoMeaningfulWarningSignals =
    !hasAnyContextualRisk &&
    !hasGenerationSignal &&
    !hasArtificialSubjectEvidence;

  const isOrdinaryPhotographicNonHumanScene =
    params.signals.visualStyle === "photographic" &&
    (params.signals.subjectType === "animal" ||
      params.signals.subjectType === "object") &&
    !hasContextWarning &&
    !hasGenerationSignal &&
    !hasArtificialSubjectEvidence &&
    !hasSensitiveOrFraudContext &&
    params.signals.manipulationLikelihood !== "high";

  if (isOrdinaryPhotographicNonHumanScene) {
    return {
      category: "likely_authentic",
      confidence: "low",
    };
  }

  if (
    params.category === "likely_ai_generated" &&
    params.signals.subjectType === "human" &&
    !hasGenerationSignal &&
    !hasArtificialSubjectEvidence &&
    hasAnyContextualRisk
  ) {
    return {
      category: "likely_manipulated",
      confidence: "medium",
    };
  }

  if (
    params.category === "likely_ai_generated" &&
    params.confidence === "low" &&
    hasNoMeaningfulWarningSignals
  ) {
    return {
      category: "likely_authentic",
      confidence: "low",
    };
  }

  if (params.signals.subjectType === "animal" && !hasAnyContextualRisk) {
    return {
      category: "likely_authentic",
      confidence: "low",
    };
  }

  if (
    hasOrdinarySceneSignal &&
    !hasAnyContextualRisk &&
    !hasArtificialSubjectEvidence
  ) {
    return {
      category: "likely_authentic",
      confidence: "low",
    };
  }

  if (
    params.signals.subjectType === "human" &&
    (hasRoleContextMismatch || hasContextWarning || hasManipulationSignal)
  ) {
    return {
      category: "likely_manipulated",
      confidence: "medium",
    };
  }

  if (
    params.category === "likely_ai_generated" &&
    params.signals.subjectType === "human" &&
    hasAnyContextualRisk
  ) {
    return {
      category: "likely_manipulated",
      confidence: "medium",
    };
  }

  if (
    params.category === "likely_ai_generated" &&
    hasOrdinarySceneSignal &&
    !hasAnyContextualRisk &&
    !hasArtificialSubjectEvidence
  ) {
    return {
      category: "likely_authentic",
      confidence: "low",
    };
  }

  if (
    (params.category === "likely_authentic" ||
      params.category === "inconclusive") &&
    hasAnyContextualRisk
  ) {
    return {
      category: "likely_manipulated",
      confidence: "medium",
    };
  }

  return {
    category: params.category,
    confidence: params.confidence,
  };
}

function isMediumOrHighSignal(value: ImageAuthenticitySignalLevel): boolean {
  return value === "medium" || value === "high";
}

function atLeastConfidence(
  value: ImageAuthenticityConfidence,
  minimum: ImageAuthenticityConfidence,
): ImageAuthenticityConfidence {
  const order = {
    low: 0,
    medium: 1,
    high: 2,
  };

  return order[value] >= order[minimum] ? value : minimum;
}

function normalizeImageAuthenticityVisualStyle(
  v: any,
): ImageAuthenticityVisualStyle {
  const s = String(v ?? "").toLowerCase();

  if (s === "photographic") return "photographic";
  if (s === "synthetic") return "synthetic";
  if (s === "mixed") return "mixed";

  return "unclear";
}

function normalizeImageAuthenticitySubjectType(
  v: any,
): ImageAuthenticitySubjectType {
  const s = String(v ?? "").toLowerCase();

  if (s === "human") return "human";
  if (s === "animal") return "animal";
  if (s === "artificial_non_human") return "artificial_non_human";
  if (s === "object") return "object";

  return "unclear";
}

function normalizeImageAuthenticitySignalLevel(
  v: any,
): ImageAuthenticitySignalLevel {
  const s = String(v ?? "").toLowerCase();

  if (s === "high") return "high";
  if (s === "medium") return "medium";
  if (s === "low") return "low";

  return "none";
}

function normalizeImageAuthenticityCategory(v: any): ImageAuthenticityCategory {
  const s = String(v ?? "").toLowerCase();

  if (s === "likely_ai_generated") return "likely_ai_generated";
  if (s === "likely_manipulated") return "likely_manipulated";
  if (s === "likely_authentic") return "likely_authentic";

  return "inconclusive";
}

function normalizeImageAuthenticityConfidence(
  v: any,
): ImageAuthenticityConfidence {
  const s = String(v ?? "").toLowerCase();

  if (s === "high") return "high";
  if (s === "medium") return "medium";

  return "low";
}
