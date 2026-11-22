import { randomUUID } from "node:crypto";
import type { AiAnalysis, ImageAuthenticityAnalysis, MediaAnalysis } from "../ai.js";
import { translationTarget, TranslationError, type TranslationProvider } from "./translation-provider.js";

/** Only explicitly selected prose is translated. Original inputs/evidence are never passed. */
export class TranslationService {
  constructor(private readonly provider: TranslationProvider | null) {}

  async fields(fields: Record<string, string>, outputLanguage: string, signal?: AbortSignal): Promise<Record<string, string>> {
    const targetLanguage = translationTarget(outputLanguage);
    if (!this.provider) return { ...fields };
    const entries = Object.entries(fields);
    const eligible = entries.filter(([, text]) => text.trim() && !/^[A-Z][A-Z0-9_]+$/.test(text));
    const result = { ...fields };
    for (let offset = 0; offset < eligible.length; offset += 50) {
      const batch = eligible.slice(offset, offset + 50);
      const protectedItems = batch.map(([, text]) => protectEvidenceReferences(text));
      const translated = await this.provider.translate({ texts: protectedItems.map((item) => item.text), targetLanguage, signal });
      if (translated.length !== batch.length || translated.some((text) => typeof text !== "string" || !text.trim())) {
        throw new TranslationError("translation_invalid_response");
      }
      for (let i = 0; i < batch.length; i++) result[batch[i][0]] = protectedItems[i].restore(translated[i]);
    }
    return result;
  }

  async analysis<T extends AiAnalysis | ImageAuthenticityAnalysis | MediaAnalysis>(analysis: T, outputLanguage: string, signal?: AbortSignal): Promise<T> {
    translationTarget(outputLanguage);
    if (!this.provider) return { ...analysis };
    const prose: Record<string, string> = { explanation: analysis.explanation };
    const arrays = ["reasons", "authenticityReasons", "fraudReasons"] as const;
    for (const name of arrays) {
      if (name in analysis) (analysis[name as keyof T] as string[]).forEach((value, i) => { prose[`${name}.${i}`] = value; });
    }
    if ("disclaimer" in analysis) prose.disclaimer = analysis.disclaimer;
    const translated = await this.fields(prose, outputLanguage, signal);
    const result = { ...analysis, explanation: translated.explanation };
    for (const name of arrays) {
      if (name in analysis) Object.assign(result, { [name]: (analysis[name as keyof T] as string[]).map((_, i) => translated[`${name}.${i}`]) });
    }
    if ("disclaimer" in analysis) Object.assign(result, { disclaimer: translated.disclaimer });
    return result;
  }
}

function protectEvidenceReferences(text: string) {
  const preserved: Array<{ marker: string; original: string }> = [];
  const prefix = `SHIELD_KEEP_${randomUUID().replaceAll("-", "")}_`;
  const masked = text.replace(/https?:\/\/[^\s<>"'“”]+|"[^"\r\n]+"|“[^”\r\n]+”/g, (original) => {
    const marker = `${prefix}${preserved.length}_END`;
    preserved.push({ marker, original });
    return marker;
  });
  return { text: masked, restore(value: string) {
    let output = value;
    for (const item of preserved) {
      if (output.split(item.marker).length !== 2) throw new TranslationError("translation_invalid_response");
      output = output.replace(item.marker, item.original);
    }
    if (output.includes(prefix)) throw new TranslationError("translation_invalid_response");
    return output;
  } };
}
