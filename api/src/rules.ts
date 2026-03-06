export type RuleReason =
  | "URL_TYPO"
  | "SHORTENER"
  | "URGENCY_LANGUAGE"
  | "SENSITIVE_DATA"
  | "SUSPICIOUS_TLD"
  | "IP_URL"
  | "SUSPICIOUS_PATH"
  | "MANY_SUBDOMAINS";

export type Ruleset = {
  version: string;
  updatedAt: string;
  urlShorteners: string[];
  suspiciousTypos: string[];
  urgencyKeywords: string[];
  sensitiveKeywords: string[];
  suspiciousTlds: string[];
  suspiciousPathKeywords: string[];
  brandKeywords: string[];
};

export function getDefaultRules(): Ruleset {
  return {
    version: "2026-02-28.2",
    updatedAt: new Date().toISOString(),

    urlShorteners: [
      "bit.ly",
      "t.co",
      "tinyurl.com",
      "goo.gl",
      "ow.ly",
      "is.gd",
      "cutt.ly",
      "rebrand.ly",
      "rb.gy",
      "shorturl.at",
      "s.id",
      "buff.ly",
      "tiny.cc",
      "soo.gd",
      "clk.sh",
      "lnkd.in",
    ],

    // Common impersonation/typo domains and lookalikes seen in scams
    suspiciousTypos: [
      "paypaI.com",
      "paypal-secure.com",
      "paypa1.com",
      "micros0ft.com",
      "microsoft-login.com",
      "g00gle.com",
      "googIe.com",
      "appleid-verify.com",
      "amazon-security.com",
      "netfl1x.com",
      "faceb00k.com",
      "secure-login-paypaI.com",
    ],

    // EN-first (DeepL should normalize other languages to English)
    urgencyKeywords: [
      // time pressure / threats
      "urgent",
      "immediately",
      "act now",
      "final notice",
      "last chance",
      "last warning",
      "your account will be closed",
      "account will be suspended",
      "account suspended",
      "account locked",
      "security alert",
      "unusual activity",
      "suspicious activity",
      "unauthorized login",
      "sign-in attempt",
      "we detected",
      "verify now",
      "verify your account",
      "confirm now",
      "confirm within",
      "limited time",
      "deadline",
      "within 24 hours",
      "within 48 hours",
      "expires today",

      // payment / delivery hooks
      "payment failed",
      "payment declined",
      "billing issue",
      "update billing",
      "update payment",
      "invoice overdue",
      "outstanding balance",
      "refund pending",
      "claim your refund",
      "delivery failed",
      "package held",
      "customs fee",
      "reschedule delivery",

      // reward / bait
      "winner",
      "winning",
      "you won",
      "prize",
      "congratulations",
      "eligible winner",
      "selected",
      "claim your prize",
      "free gift",
      "assigned payment",
    ],

    sensitiveKeywords: [
      // credentials / codes
      "password",
      "passcode",
      "one-time password",
      "otp",
      "verification code",
      "2fa",
      "mfa",
      "security code",
      "login code",

      // payments / identity
      "card",
      "credit card",
      "debit card",
      "cvv",
      "cvc",
      "pin",
      "ssn",
      "national id",
      "id number",
      "bank account",
      "routing number",

      // crypto
      "seed phrase",
      "recovery phrase",
      "wallet",
      "private key",
    ],

    suspiciousTlds: [
      "xyz",
      "top",
      "click",
      "live",
      "info",
      "loan",
      "work",
      "site",
      "biz",
      "icu",
      "zip",
      "mov",
      "gq",
      "tk",
    ],

    suspiciousPathKeywords: [
      "login",
      "signin",
      "sign-in",
      "verify",
      "verification",
      "account",
      "secure",
      "security",
      "update",
      "billing",
      "payment",
      "wallet",
      "support",
      "confirm",
      "unlock",
      "reset",
      "track",
      "package"
    ],

    brandKeywords: [
      "paypal",
      "apple",
      "amazon",
      "google",
      "microsoft",
      "netflix",
      "facebook",
      "instagram",
      "whatsapp",
      "dhl",
      "fedex",
      "ups",
      "usps",
    ],
  };
}

function extractUrls(input: string): string[] {
  // Simple and robust URL extraction for pasted text.
  // Avoid heavy parsing; we only need candidates.
  const matches = input.match(/\bhttps?:\/\/[^\s<>()]+/gi);

  if (!matches) return [];

  return Array.from(
    new Set(
      matches
        .map((u) => u.replace(/[),.;!?]+$/g, "")) // trim trailing punctuation
        .slice(0, 10),
    ),
  );
}

function looksLikeIpHost(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function countSubdomains(hostname: string): number {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return 0;
  return parts.length - 2;
}

function getTld(hostname: string): string | null {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  return parts[parts.length - 1].toLowerCase();
}

export function scoreInput(
  input: string,
  rules: Ruleset,
): { riskScore: number; category: string; reasons: RuleReason[] } {
  const lower = input.toLowerCase();

  let score = 0;
  const reasons: RuleReason[] = [];

  // 🔹 URL heuristics (works even without translation)
  const urls = extractUrls(input);

  for (const raw of urls) {
    let url: URL | null = null;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }

    const hostname = url.hostname.toLowerCase();

    // IP-based URLs are common in scams
    if (looksLikeIpHost(hostname)) {
      score += 35;
      reasons.push("IP_URL");
    }

    // Too many subdomains is suspicious (e.g. paypal.secure.login.example.com)
    if (countSubdomains(hostname) >= 3) {
      score += 20;
      reasons.push("MANY_SUBDOMAINS");
    }

    // Suspicious TLDs
    const tld = getTld(hostname);
    if (tld && rules.suspiciousTlds.includes(tld)) {
      score += 20;
      reasons.push("SUSPICIOUS_TLD");
    }

    // Punycode domains (xn--) can indicate impersonation
    if (hostname.includes("xn--")) {
      score += 25;
      reasons.push("URL_TYPO");
    }

    // NEW: insecure http (no TLS)
    if (url.protocol === "http:") {
      score += 25;
      reasons.push("URL_TYPO");
    }

    // NEW: many hyphens in hostname is common in scam domains
    const hyphenCount = (hostname.match(/-/g) ?? []).length;
    if (hyphenCount >= 2) {
      score += 15;
      reasons.push("URL_TYPO");
    }

    // NEW: brand impersonation in hostname (paypal, apple, amazon...)
    for (const b of rules.brandKeywords) {
      if (hostname.includes(b)) {
        score += 35;
        reasons.push("URL_TYPO");
        break;
      }
    }

    // Improved: suspicious keywords in hostname + path (not only path)
    const combinedLower =
      `${hostname}${url.pathname}${url.search}`.toLowerCase();
    for (const k of rules.suspiciousPathKeywords) {
      if (combinedLower.includes(k)) {
        score += 20; // was 15, and now also matches hostname
        reasons.push("SUSPICIOUS_PATH");
        break;
      }
    }
  }

  // 🔹 URL shorteners
  for (const s of rules.urlShorteners) {
    if (lower.includes(s)) {
      score += 20;
      reasons.push("SHORTENER");
      break;
    }
  }

  // 🔹 Suspicious typos
  for (const t of rules.suspiciousTypos) {
    if (lower.includes(t.toLowerCase())) {
      score += 35;
      reasons.push("URL_TYPO");
      break;
    }
  }

  // 🔹 Urgency language (EN-first)
  for (const k of rules.urgencyKeywords) {
    if (lower.includes(k)) {
      score += 20;
      reasons.push("URGENCY_LANGUAGE");
      break;
    }
  }

  // 🔹 Money amount heuristic (language-agnostic)
  if (/\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s?(eur|€|usd|\$)\b/i.test(input)) {
    score += 25;
    reasons.push("URGENCY_LANGUAGE");
  }

  // 🔹 Sensitive data prompts
  for (const k of rules.sensitiveKeywords) {
    if (lower.includes(k)) {
      score += 30;
      reasons.push("SENSITIVE_DATA");
      break;
    }
  }

  // 🔹 Structural scam heuristics (language-agnostic core)
  const hasTimePressure =
    /\b\d+\s?(hours|hour|h|hrs)\b/i.test(lower) || /\b(24|48)\b/.test(lower);

  const hasWinnerContext = /\b(winner|winning|prize)\b/i.test(lower);

  const hasConfirmationRequest = /\b(confirm|accept)\b/i.test(lower);

  if (hasTimePressure && hasWinnerContext && hasConfirmationRequest) {
    score += 60;
    reasons.push("URGENCY_LANGUAGE");
  }

  // Cap score
  if (score > 100) score = 100;

  const category =
    score >= 70 ? "high_risk" : score >= 35 ? "medium_risk" : "low_risk";

  const uniqueReasons = Array.from(new Set(reasons));

  return {
    riskScore: score,
    category,
    reasons: uniqueReasons,
  };
}
