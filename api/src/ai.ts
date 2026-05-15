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

type AnalyzeWithAIParams = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  input: string;
  outputLanguage: string;
};

type OllamaGenerateResponse = {
  response?: string;
};

function normalizeOutputLanguage(language: string): string {
  const value = language.trim().toLowerCase();

  if (value === "es") return "Spanish";
  if (value === "fr") return "French";
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
    system,
    "",
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

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (params.apiKey && params.apiKey.trim().length > 0) {
    headers["Authorization"] = `Bearer ${params.apiKey}`;
  }

  const res = await fetch(`${params.baseUrl}/api/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: params.model,
      prompt,
      stream: false,
      format: {
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

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI response was not valid JSON");
  }

  const riskScore = clampInt(parsed?.riskScore, 0, 100);
  const category = normalizeCategory(parsed?.category);
  const threatType = normalizeThreatType(parsed?.threatType, category);
  const reasons = Array.isArray(parsed?.reasons)
    ? parsed.reasons
        .map((r: any) =>
          String(r)
            .replace(/^reasons\./i, "")
            .trim(),
        )
        .filter((r: string) => r.length > 0)
        .slice(0, 10)
    : [];

  const explanation =
    typeof parsed?.explanation === "string" &&
    parsed.explanation.trim().length > 0
      ? parsed.explanation.trim()
      : "No explanation provided.";

  return { riskScore, category, threatType, reasons, explanation };
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
