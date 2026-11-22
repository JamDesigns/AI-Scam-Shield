import { z } from "zod";
import { parseSupportedLocale } from "../locales.js";
const translatedResponse = z.object({
  provider: z.literal("madlad400-3b-ct2-int8"), targetLanguage: z.string(),
  texts: z.array(z.string().trim().min(1).max(4000)).max(16),
}).strict();

/** Translate generated narrative only. Original evidence and machine-readable
 * scores, categories, confidence and reason ordering remain unchanged. */
export async function translateLocalNarrative<T>(value: T, language: string | undefined,
  options: { endpoint: URL | null; signal: AbortSignal; fetchImpl: typeof fetch }): Promise<T> {
  if (!language || !value || typeof value !== "object" || Array.isArray(value)) return value;
  const locale = parseSupportedLocale(language);
  if (!locale) throw new Error("Unsupported local narrative language");
  if (locale === "en-GB") return value;
  const record = value as Record<string, unknown>;
  const paths: Array<{ key: string; index?: number }> = [];
  const texts: string[] = [];
  for (const key of ["reasons", "authenticityReasons", "fraudReasons", "explanation", "disclaimer"]) {
    if (!(key in record)) continue;
    if (Array.isArray(record[key])) {
      const items = record[key] as unknown[];
      if (items.length > 10 || items.some(x => typeof x !== "string" || !x.trim() || x.length > 1000)) throw new Error("Invalid source narrative reasons");
      items.forEach((text, index) => { texts.push(text as string); paths.push({ key, index }); });
    } else {
      const text = record[key];
      if (typeof text !== "string" || !text.trim() || text.length > 4000) throw new Error("Invalid source narrative text");
      texts.push(text); paths.push({ key });
    }
  }
  // Transcripts have no narrative fields: preserve the original language.
  if (!texts.length) return value;
  if (texts.length > 16 || texts.reduce((sum, text) => sum + text.length, 0) > 6000) throw new Error("Source narrative exceeds translation bounds");
  if (!options.endpoint) throw new Error("Detailed local narratives require the offline translation service");
  options.signal.throwIfAborted();
  const response = await options.fetchImpl(options.endpoint, {
    method: "POST", redirect: "error", signal: options.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceLanguage: "en", targetLanguage: locale, texts }),
  });
  if (!response.ok) throw new Error(`Offline narrative translation failed (${response.status})`);
  const translated = translatedResponse.safeParse(await response.json());
  if (!translated.success || translated.data.targetLanguage !== locale || translated.data.texts.length !== texts.length) throw new Error("Invalid offline narrative translation");
  if (texts.some(text => text.length >= 40) && translated.data.texts.every((text, index) => text === texts[index])) throw new Error("Offline service did not translate the narrative");
  const result = { ...record };
  for (const { key, index } of paths) if (index !== undefined && result[key] === record[key]) result[key] = [...record[key] as string[]];
  paths.forEach(({ key, index }, offset) => {
    if (index === undefined) result[key] = translated.data.texts[offset];
    else (result[key] as string[])[index] = translated.data.texts[offset];
  });
  return result as T;
}
