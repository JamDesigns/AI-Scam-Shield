export const SUPPORTED_LOCALES = [
  "bg", "hr", "cs", "da", "nl", "en-GB", "et", "fi", "fr", "de",
  "el", "hu", "ga", "it", "lv", "lt", "mt", "pl", "pt", "ro",
  "sk", "sl", "es", "sv", "ca",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const languageNames: Record<SupportedLocale, string> = {
  bg: "Bulgarian", hr: "Croatian", cs: "Czech", da: "Danish",
  nl: "Dutch", "en-GB": "British English", et: "Estonian", fi: "Finnish",
  fr: "French", de: "German", el: "Greek", hu: "Hungarian", ga: "Irish",
  it: "Italian", lv: "Latvian", lt: "Lithuanian", mt: "Maltese", pl: "Polish",
  pt: "European Portuguese", ro: "Romanian", sk: "Slovak", sl: "Slovenian",
  es: "Spanish", sv: "Swedish", ca: "Catalan",
};

/** Use at API boundaries when an unsupported locale must be rejected. */
export function parseSupportedLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().replaceAll("_", "-").toLowerCase();
  if (!/^[a-z]{2}(?:-[a-z0-9]{2,8})*$/.test(tag)) return null;
  const language = tag.split("-")[0];
  if (language === "en") return "en-GB";
  return SUPPORTED_LOCALES.find((locale) => locale === language) ?? null;
}

/** Internal default only; API validation should use parseSupportedLocale. */
export function resolveLocale(value: unknown): SupportedLocale {
  return parseSupportedLocale(value) ?? "en-GB";
}

export function getOutputLanguageName(value: unknown): string {
  return languageNames[resolveLocale(value)];
}

const estimateDisclaimers: Record<SupportedLocale, string> = {
  bg: "Това е автоматична оценка и не доказва автентичност или измама.",
  hr: "Ovo je automatizirana procjena i ne dokazuje autentičnost ni prijevaru.",
  cs: "Jde o automatický odhad, který neprokazuje pravost ani podvod.",
  da: "Dette er en automatisk vurdering og beviser hverken ægthed eller svindel.",
  nl: "Dit is een automatische inschatting en bewijst geen authenticiteit of fraude.",
  "en-GB": "This is an automated estimate and cannot prove authenticity or fraudulent intent with certainty.",
  et: "See on automaatne hinnang ega tõenda ehtsust ega pettust.",
  fi: "Tämä on automaattinen arvio, joka ei todista aitoutta tai petosta.",
  fr: "Il s’agit d’une estimation automatisée qui ne prouve ni l’authenticité ni une intention frauduleuse.",
  de: "Dies ist eine automatische Einschätzung und kein Beweis für Echtheit oder Betrugsabsicht.",
  el: "Αυτή είναι μια αυτοματοποιημένη εκτίμηση και δεν αποδεικνύει αυθεντικότητα ή απάτη.",
  hu: "Ez automatikus becslés, nem bizonyítja a hitelességet vagy a csalási szándékot.",
  ga: "Is meastachán uathoibríoch é seo agus ní cruthúnas é ar bharántúlacht ná ar chalaois.",
  it: "Questa è una stima automatizzata e non dimostra autenticità o intento fraudolento.",
  lv: "Šis ir automatizēts novērtējums, kas nepierāda autentiskumu vai krāpšanu.",
  lt: "Tai automatinis vertinimas, kuris neįrodo autentiškumo ar sukčiavimo.",
  mt: "Din hija stima awtomatizzata u ma tipprovax l-awtentiċità jew intenzjoni ta’ frodi.",
  pl: "To automatyczna ocena, która nie stanowi dowodu autentyczności ani oszustwa.",
  pt: "Esta é uma estimativa automatizada e não prova autenticidade nem intenção fraudulenta.",
  ro: "Aceasta este o estimare automată și nu dovedește autenticitatea sau intenția de fraudă.",
  sk: "Ide o automatický odhad, ktorý nedokazuje pravosť ani podvod.",
  sl: "To je samodejna ocena in ne dokazuje pristnosti ali goljufije.",
  es: "Esta es una estimación automatizada y no demuestra autenticidad ni intención fraudulenta.",
  sv: "Detta är en automatisk bedömning och bevisar varken äkthet eller bedrägeri.",
  ca: "Aquesta és una estimació automatitzada i no demostra autenticitat ni intenció fraudulenta.",
};

export function getAutomatedEstimateDisclaimer(value: unknown): string {
  return estimateDisclaimers[resolveLocale(value)];
}
