import { extractUrls, type RuleReason } from "./rules.js";

export type ClassicAssessment = {
  category: "low_risk" | "medium_risk" | "high_risk" | "inconclusive";
  riskScore: number | null;
  reasons: RuleReason[];
  languageNormalizationUnavailable: boolean;
};

/** Do not guess the source language from ASCII or from the app's selected locale. */
export function hasNaturalText(input: string): boolean {
  let remainder = input;
  for (const candidate of extractUrls(input)) {
    try { new URL(candidate); } catch { continue; }
    remainder = remainder.split(candidate).join(" ");
    remainder = remainder.split(candidate.replace(/^https?:\/\//i, "")).join(" ");
  }
  return /\p{L}/u.test(remainder);
}

/** The classic engine may retain positive signals, but cannot certify unassessed prose as low risk. */
export function assessClassicResult(params: {
  input: string;
  score: { category: "low_risk" | "medium_risk" | "high_risk"; riskScore: number; reasons: RuleReason[] };
  normalizationUnavailable: boolean;
}): ClassicAssessment {
  const limited = params.normalizationUnavailable && hasNaturalText(params.input);
  const inconclusive = limited && params.score.category === "low_risk";
  return {
    category: inconclusive ? "inconclusive" : params.score.category,
    riskScore: inconclusive ? null : params.score.riskScore,
    reasons: params.score.reasons,
    languageNormalizationUnavailable: limited,
  };
}
