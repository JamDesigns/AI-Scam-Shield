import { z, type ZodType } from "zod";

const narrative = z.string().trim().min(1).max(4000);
const reasons = z.array(z.string().trim().min(1).max(1000)).max(10);
const confidence = z.enum(["low", "medium", "high"]);
const signal = z.enum(["none", "low", "medium", "high"]);
const riskShape = {
  riskScore: z.number().finite().int().min(0).max(100),
  category: z.enum(["low_risk", "medium_risk", "high_risk"]),
  threatType: z.enum([
    "bank_phishing", "malware", "investment_scam", "fake_support",
    "account_takeover", "delivery_scam", "crypto_scam", "unknown_suspicious", "none",
  ]),
  reasons,
  explanation: narrative,
};

function validateRiskCoherence(
  value: { riskScore: number; category: string; threatType: string },
  context: z.RefinementCtx,
): void {
  const category = value.riskScore >= 70 ? "high_risk"
    : value.riskScore >= 35 ? "medium_risk" : "low_risk";
  if (value.category !== category) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["category"], message: "Category does not match riskScore" });
  }
  if (value.category !== "low_risk" && value.threatType === "none") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["threatType"], message: "Elevated risk requires a threat type" });
  }
}

export const textAnalysisSchema = z.object(riskShape).strict().superRefine(validateRiskCoherence);

export const videoAnalysisSchema = z.object({
  ...riskShape,
  contentContext: z.enum(["direct_scam_attempt", "educational_or_reporting", "uncertain"]),
  deceptiveSolicitation: z.boolean(),
  financialInstitutionImpersonation: z.boolean(),
}).strict().superRefine(validateRiskCoherence);

export const mediaAuthenticitySchema = z.object({
  authenticity: z.enum(["likely_authentic", "manipulated_or_synthetic", "inconclusive"]),
  confidence,
  reasons,
  explanation: narrative,
}).strict();

export const mediaFraudSchema = z.object({
  fraudAssessment: z.enum(["no_clear_signals", "possible_fraud", "strong_fraud_signals", "inconclusive"]),
  confidence,
  reasons,
  explanation: narrative,
}).strict();

export const imageAuthenticitySchema = z.object({
  category: z.enum(["likely_ai_generated", "likely_manipulated", "likely_authentic", "inconclusive"]),
  confidence,
  visualStyle: z.enum(["photographic", "synthetic", "mixed", "unclear"]),
  subjectType: z.enum(["human", "animal", "artificial_non_human", "object", "unclear"]),
  contextWarningLevel: signal,
  manipulationLikelihood: signal,
  generationLikelihood: signal,
  ordinarySceneLikelihood: signal,
  artificialSubjectEvidence: signal,
  roleContextMismatchLevel: signal,
  sensitiveOrFraudContextLevel: signal,
  reasons,
  explanation: narrative,
  disclaimer: narrative,
}).strict().superRefine((value, context) => {
  const generationEvidence = ["medium", "high"].includes(value.generationLikelihood);
  const manipulationEvidence = ["medium", "high"].includes(value.manipulationLikelihood);
  if (value.category === "likely_ai_generated" && !generationEvidence
      || value.category === "likely_manipulated" && !manipulationEvidence
      || value.category === "likely_authentic" && (generationEvidence || manipulationEvidence)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["category"], message: "Authenticity category contradicts image-level evidence" });
  }
});

export class InvalidAiAnalysisError extends Error {
  readonly code = "invalid_ai_analysis";
  constructor(readonly analysisKind: string, readonly invalidFields: string[]) {
    super(`Invalid ${analysisKind} analysis response`);
    this.name = "InvalidAiAnalysisError";
  }
}

/** Never log or silently repair untrusted model output into a safe-looking result. */
export function validateAiAnalysis<T>(schema: ZodType<T>, raw: unknown, kind: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new InvalidAiAnalysisError(kind, result.error.issues.map((issue) => issue.path.join(".")));
  }
  return result.data;
}
