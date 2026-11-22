import { parseSupportedLocale, SUPPORTED_LOCALES, type SupportedLocale } from "../locales.js";

export const TRANSLATION_TARGETS: Record<SupportedLocale, string> = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale, locale === "en-GB" ? "EN-GB" : locale === "pt" ? "PT-PT" : locale.toUpperCase()]),
) as Record<SupportedLocale, string>;

export class TranslationError extends Error {
  constructor(readonly code: "translation_unavailable" | "translation_target_unsupported" | "translation_invalid_response" | "translation_configuration_invalid") {
    super(code);
  }
}

export function translationTarget(locale: string): string {
  const supported = parseSupportedLocale(locale);
  if (!supported) throw new TranslationError("translation_target_unsupported");
  return TRANSLATION_TARGETS[supported];
}

export type TranslationRequest = {
  texts: readonly string[];
  targetLanguage: string;
  signal?: AbortSignal;
};

export interface TranslationProvider {
  readonly name: string;
  translate(request: TranslationRequest): Promise<string[]>;
  supportedTargets(signal?: AbortSignal): Promise<ReadonlySet<string>>;
}

export async function verifyTranslationCoverage(provider: TranslationProvider, signal?: AbortSignal) {
  const targets = await provider.supportedTargets(signal);
  const missingLocales = SUPPORTED_LOCALES.filter((locale) => !targets.has(TRANSLATION_TARGETS[locale]));
  return { provider: provider.name, checkedLocales: SUPPORTED_LOCALES.length, missingLocales, ready: missingLocales.length === 0 };
}
