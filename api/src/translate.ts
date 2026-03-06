export type TranslationResult = {
  text: string;
  detectedSourceLanguage?: string;
};

export async function translateWithDeepL(params: {
  text: string;
  authKey: string;
  apiBase: string;
  targetLang: string; // e.g. "EN"
}): Promise<TranslationResult> {
  const { text, authKey, apiBase, targetLang } = params;

  const url = new URL("/v2/translate", apiBase);

  const body = new URLSearchParams();
  body.set("text", text);
  body.set("target_lang", targetLang);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      // DeepL header-based auth (required)
      Authorization: `DeepL-Auth-Key ${authKey}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const payload = await res.text().catch(() => "");
    throw new Error(`DeepL error: ${res.status} ${payload}`);
  }

  const json = (await res.json()) as {
    translations?: Array<{ text: string; detected_source_language?: string }>;
  };

  const t = json.translations?.[0];
  if (!t?.text) throw new Error("DeepL error: missing translation");

  return {
    text: t.text,
    detectedSourceLanguage: t.detected_source_language,
  };
}
