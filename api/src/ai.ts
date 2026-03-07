export type RiskCategory = "low_risk" | "medium_risk" | "high_risk";

export type AiAnalysis = {
  riskScore: number;
  category: RiskCategory;
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
    '{ "riskScore": number(0..100), "category": "low_risk"|"medium_risk"|"high_risk", "reasons": string[], "explanation": string }',
    "",
    "Rules:",
    "- riskScore must reflect overall fraud probability.",
    "- category must align with riskScore (>=70 high_risk, >=35 medium_risk).",
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
        required: ["riskScore", "category", "reasons", "explanation"],
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

  return { riskScore, category, reasons, explanation };
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
