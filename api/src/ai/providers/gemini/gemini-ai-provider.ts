import type { AiProvider, AiProviderRequest } from "../../ai-provider.js";
import { outputTokenLimit, reportUsage, tokenCount } from "../../provider-usage.js";
import { withDeadline } from "../../../runtime-deadline.js";

export type GeminiAiProviderConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
  maxOutputTokens?: number;
  sendTemperature?: boolean;
};

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
};

/** Native generateContent adapter; no OpenAI-compatible proxy or automatic vendor fallback. */
export class GeminiAiProvider implements AiProvider {
  readonly name = "gemini";
  private readonly endpoint: string;
  private readonly model: string;

  constructor(private readonly config: GeminiAiProviderConfig) {
    this.model = config.model.trim().replace(/^models\//, "");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(this.model)) {
      throw new Error("Invalid Gemini model identifier");
    }
    const base = new URL(config.baseUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
      throw new Error("Gemini requires a credential-free HTTPS API base URL");
    }
    if (!config.apiKey.trim()) throw new Error("Gemini API key is required");
    this.endpoint = `${base.toString().replace(/\/+$/, "")}/models/${this.model}:generateContent`;
    outputTokenLimit({ prompt: "", schema: {} }, config.maxOutputTokens);
  }

  async requestJson<T = unknown>(params: AiProviderRequest): Promise<T> {
    return withDeadline((signal) => this.performRequest<T>({ ...params, signal }), params, "Gemini request");
  }

  private async performRequest<T>(params: AiProviderRequest): Promise<T> {
    if (params.schema.type !== "object" || !params.schema.properties || typeof params.schema.properties !== "object") {
      throw new Error("Gemini assessment schema must describe an object");
    }
    const parts: Array<Record<string, unknown>> = [{ text: params.prompt }];
    for (const media of params.media ?? []) {
      // Video uses sampled JPEG frames; transcription supplies bounded extracted PCM WAV.
      // Raw video is never implicitly routed around the forensic/transcription pipeline.
      if (!/^(image\/(jpeg|png|webp|heic|heif)|audio\/wav)$/.test(media.mimeType.toLowerCase())) {
        throw new Error("Unsupported Gemini media type in this integration");
      }
      parts.push({ inlineData: { mimeType: media.mimeType.toLowerCase(), data: media.dataBase64 } });
    }
    const response = await fetch(this.endpoint, {
      method: "POST",
      signal: params.signal,
      headers: { "x-goog-api-key": this.config.apiKey.trim(), "content-type": "application/json" },
      redirect: "error",
      body: JSON.stringify({
        ...(params.system ? { systemInstruction: { parts: [{ text: params.system }] } } : {}),
        contents: [{ role: "user", parts }],
        generationConfig: {
          candidateCount: 1,
          maxOutputTokens: outputTokenLimit(params, this.config.maxOutputTokens),
          responseMimeType: "application/json",
          responseJsonSchema: params.schema,
          ...(this.config.sendTemperature !== false && typeof params.temperature === "number" ? { temperature: params.temperature } : {}),
        },
      }),
    });
    if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
    let body: GeminiResponse;
    try { body = await response.json() as GeminiResponse; }
    catch { throw new Error("Gemini returned an invalid response body"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Gemini returned an invalid response body");
    if (body.usageMetadata && typeof body.usageMetadata === "object") {
      reportUsage(params, {
        provider: this.name, model: this.model,
        inputTokens: tokenCount(body.usageMetadata.promptTokenCount),
        outputTokens: tokenCount(body.usageMetadata.candidatesTokenCount),
        cachedInputTokens: tokenCount(body.usageMetadata.cachedContentTokenCount),
        reasoningTokens: tokenCount(body.usageMetadata.thoughtsTokenCount),
        totalTokens: tokenCount(body.usageMetadata.totalTokenCount),
      });
    }
    if (body.promptFeedback?.blockReason && body.promptFeedback.blockReason !== "BLOCK_REASON_UNSPECIFIED") {
      throw new Error("Gemini blocked the request");
    }
    if (!Array.isArray(body.candidates) || body.candidates.length !== 1) throw new Error("Gemini returned no single assessment");
    const candidate = body.candidates[0];
    if (candidate?.finishReason !== "STOP") throw new Error("Gemini response was blocked or incomplete");
    if (!Array.isArray(candidate.content?.parts)) throw new Error("Gemini returned empty content");
    const text = candidate.content.parts.filter((part) => part && part.thought !== true && typeof part.text === "string")
      .map((part) => part.text).join("").trim();
    if (!text) throw new Error("Gemini returned empty content");
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error("Gemini response was not valid JSON"); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Gemini assessment must be a JSON object");
    return parsed as T; // Existing application assessment validators remain authoritative.
  }
}
