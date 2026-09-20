import type {
  AiProvider,
  AiProviderMedia,
  AiProviderRequest,
} from "../../ai-provider.js";

export type OllamaAiProviderConfig = {
  baseUrl: string;
  model: string;
  apiKey?: string;
};

export class OllamaAiProvider implements AiProvider {
  readonly name = "ollama";

  constructor(private readonly config: OllamaAiProviderConfig) {}

  async requestJson<T = unknown>(
    params: AiProviderRequest,
  ): Promise<T> {
    if (params.mode === "completion") {
      return this.requestCompletion<T>(params);
    }

    return this.requestConversation<T>(params);
  }

  private async requestCompletion<T = unknown>(
    params: AiProviderRequest,
  ): Promise<T> {
    const response = await fetch(
      `${this.normalizedBaseUrl}/api/generate`,
      {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          ...(params.system ? { system: params.system } : {}),
          prompt: params.prompt,
          ...this.buildImagePayload(params.media),
          stream: false,
          format: params.schema,
          options: {
            temperature: params.temperature ?? 0.2,
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Ollama request failed (${response.status}): ${body}`,
      );
    }

    const body = (await response.json()) as {
      response?: string;
    };

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
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages,
          stream: false,
          format: params.schema,
          options: {
            temperature: params.temperature ?? 0.1,
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Ollama request failed (${response.status}): ${body}`,
      );
    }

    const body = (await response.json()) as {
      message?: {
        content?: string;
      };
    };

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
