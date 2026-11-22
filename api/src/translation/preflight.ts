import { pathToFileURL } from "node:url";
import { createTranslationProvider } from "./deepl-translation-provider.js";
import { verifyTranslationCoverage } from "./translation-provider.js";

/** Explicit command only: uses environment credentials, never logs them or runs on import. */
export async function translationPreflight() {
  const profile = process.env.ANALYSIS_PROFILE;
  if (profile !== "local" && profile !== "production") throw new Error("Set ANALYSIS_PROFILE explicitly");
  const providerName = process.env.TRANSLATION_PROVIDER ?? "none";
  if (providerName !== "none" && providerName !== "deepl") throw new Error("Unsupported TRANSLATION_PROVIDER");
  const provider = createTranslationProvider({ profile, provider: providerName,
    deepl: process.env.DEEPL_AUTH_KEY ? { authKey: process.env.DEEPL_AUTH_KEY, apiBase: process.env.DEEPL_API_BASE } : undefined });
  if (!provider) return { profile, provider: "none", ready: false, reason: "external_translation_disabled" };
  return verifyTranslationCoverage(provider);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  translationPreflight().then((report) => { console.log(JSON.stringify(report)); if (!report.ready) process.exitCode = 1; })
    .catch(() => { console.error("Translation preflight failed; check provider configuration or availability."); process.exitCode = 1; });
}
