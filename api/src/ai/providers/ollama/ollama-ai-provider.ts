import type {
  AiProvider,
  AiProviderMedia,
  AiProviderRequest,
} from "../../ai-provider.js";
import { withDeadline } from "../../../runtime-deadline.js";
import { outputTokenLimit, reportUsage, tokenCount } from "../../provider-usage.js";

export type OllamaAiProviderConfig = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  maxOutputTokens?: number;
  sendTemperature?: boolean;
};

export class OllamaAiProvider implements AiProvider {
  readonly name = "ollama";

  constructor(private readonly config: OllamaAiProviderConfig) {}

  async requestJson<T = unknown>(
    params: AiProviderRequest,
  ): Promise<T> {
    return withDeadline((signal) => params.mode === "completion"
      ? this.requestCompletion<T>({ ...params, signal })
      : this.requestConversation<T>({ ...params, signal }), params, "Ollama request");
  }

  private async requestCompletion<T = unknown>(
    params: AiProviderRequest,
  ): Promise<T> {
    const response = await fetch(
      `${this.normalizedBaseUrl}/api/generate`,
      {
        method: "POST",
        signal: params.signal,
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          ...(params.system ? { system: params.system } : {}),
          prompt: params.prompt,
          ...this.buildImagePayload(params.media),
          stream: false,
          format: params.schema,
          options: {
            ...(this.config.sendTemperature !== false ? { temperature: params.temperature ?? 0.2 } : {}),
            num_predict: outputTokenLimit(params, this.config.maxOutputTokens),
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Ollama request failed (${response.status})`,
      );
    }

    const body = (await response.json()) as {
      response?: string;
      prompt_eval_count?: number;
      eval_count?: number;
      done_reason?: string;
    };

    this.reportTokens(params, body);
    if (body.done_reason === "length") throw new Error("Ollama response was incomplete");

    return this.parseJsonContent<T>(body.response);
  }

  private async requestConversation<T = unknown>(
    params: AiProviderRequest,
  ): Promise<T> {
    const images = this.getImages(params.media);

    const messages = [
      ...(params.system
        ? [
            {
              role: "system",
              content: params.system,
            },
          ]
        : []),
      {
        role: "user",
        content: params.prompt,
        ...(images.length > 0 ? { images } : {}),
      },
    ];

    const response = await fetch(
      `${this.normalizedBaseUrl}/api/chat`,
      {
        method: "POST",
        signal: params.signal,
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages,
          stream: false,
          format: params.schema,
          options: {
            ...(this.config.sendTemperature !== false ? { temperature: params.temperature ?? 0.1 } : {}),
            num_predict: outputTokenLimit(params, this.config.maxOutputTokens),
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Ollama request failed (${response.status})`,
      );
    }

    const body = (await response.json()) as {
      message?: {
        content?: string;
      };
      prompt_eval_count?: number;
      eval_count?: number;
      done_reason?: string;
    };

    this.reportTokens(params, body);
    if (body.done_reason === "length") throw new Error("Ollama response was incomplete");

    return this.parseJsonContent<T>(body.message?.content);
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (this.config.apiKey?.trim()) {
      headers.Authorization = `Bearer ${this.config.apiKey.trim()}`;
    }

    return headers;
  }

  private reportTokens(params: AiProviderRequest, body: { prompt_eval_count?: number; eval_count?: number }): void {
    const inputTokens = tokenCount(body.prompt_eval_count);
    const outputTokens = tokenCount(body.eval_count);
    if (inputTokens === undefined && outputTokens === undefined) return;
    reportUsage(params, { provider: this.name, model: this.config.model, inputTokens, outputTokens,
      totalTokens: inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined });
  }

  private buildImagePayload(
    media?: AiProviderMedia[],
  ): { images?: string[] } {
    const images = this.getImages(media);

    return images.length > 0 ? { images } : {};
  }

  private getImages(media?: AiProviderMedia[]): string[] {
    if (!media?.length) {
      return [];
    }

    return media.map((item) => {
      if (!item.mimeType.toLowerCase().startsWith("image/")) {
        throw new Error(
          `Ollama provider does not support media type "${item.mimeType}"`,
        );
      }

      return item.dataBase64;
    });
  }

  private parseJsonContent<T = unknown>(content?: string): T {
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("Ollama returned empty content");
    }

    try {
      return JSON.parse(content) as T;
    } catch {
      throw new Error("Ollama response was not valid JSON");
    }
  }

  private get normalizedBaseUrl(): string {
    return this.config.baseUrl.replace(/\/+$/, "");
  }
}
