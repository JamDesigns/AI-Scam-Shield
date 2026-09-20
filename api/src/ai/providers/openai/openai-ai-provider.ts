import type {
  AiProvider,
  AiProviderMedia,
  AiProviderRequest,
} from "../../ai-provider.js";

export type OpenAiProviderConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

type OpenAiResponse = {
  status?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
};

export class OpenAiProvider implements AiProvider {
  readonly name = "openai";

  constructor(private readonly config: OpenAiProviderConfig) {}

  async requestJson<T = unknown>(
    params: AiProviderRequest,
  ): Promise<T> {
    const input = [
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
        content: [
          {
            type: "input_text",
            text: params.prompt,
          },
          ...this.buildMediaContent(params.media),
        ],
      },
    ];

    const response = await fetch(
      `${this.normalizedBaseUrl}/responses`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          input,
          store: false,
          ...(typeof params.temperature === "number"
            ? { temperature: params.temperature }
            : {}),
          text: {
            format: {
              type: "json_schema",
              name: "scam_shield_response",
              strict: true,
              schema: this.prepareStructuredOutputSchema(params.schema),
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `OpenAI request failed (${response.status}): ${body}`,
      );
    }

    const body = (await response.json()) as OpenAiResponse;

    if (body.status && body.status !== "completed") {
      throw new Error(
        `OpenAI response ended with status "${body.status}"`,
      );
    }

    const content = body.output
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? []);

    const refusal = content?.find(
      (item) => item.type === "refusal",
    )?.refusal;

    if (refusal) {
      throw new Error(`OpenAI refused the request: ${refusal}`);
    }

    const outputText = content?.find(
      (item) => item.type === "output_text",
    )?.text;

    if (
      typeof outputText !== "string" ||
      outputText.trim().length === 0
    ) {
      throw new Error("OpenAI returned empty content");
    }

    try {
      return JSON.parse(outputText) as T;
    } catch {
      throw new Error("OpenAI response was not valid JSON");
    }
  }

  private buildMediaContent(
    media?: AiProviderMedia[],
  ): Array<Record<string, string>> {
    if (!media?.length) {
      return [];
    }

    return media.map((item) => {
      if (!item.mimeType.toLowerCase().startsWith("image/")) {
        throw new Error(
          `OpenAI provider does not support media type "${item.mimeType}" in this integration`,
        );
      }

      return {
        type: "input_image",
        image_url: `data:${item.mimeType};base64,${item.dataBase64}`,
      };
    });
  }

  private prepareStructuredOutputSchema(
    schema: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.normalizeSchemaNode(schema);
  }

  private normalizeSchemaNode(
    node: unknown,
  ): Record<string, unknown> {
    if (
      typeof node !== "object" ||
      node === null ||
      Array.isArray(node)
    ) {
      throw new Error("OpenAI JSON schema node must be an object");
    }

    const source = node as Record<string, unknown>;
    const normalized: Record<string, unknown> = { ...source };

    if (
      source.properties &&
      typeof source.properties === "object" &&
      !Array.isArray(source.properties)
    ) {
      const properties = source.properties as Record<
        string,
        unknown
      >;

      normalized.properties = Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [
          key,
          this.normalizeSchemaNode(value),
        ]),
      );

      if (source.type === "object") {
        normalized.additionalProperties = false;

        const required = Array.isArray(source.required)
          ? source.required
          : [];

        const propertyNames = Object.keys(properties);

        if (
          propertyNames.some(
            (property) => !required.includes(property),
          )
        ) {
          throw new Error(
            "OpenAI structured output requires every object property to be required",
          );
        }
      }
    }

    if (source.items) {
      normalized.items = this.normalizeSchemaNode(source.items);
    }

    return normalized;
  }

  private get normalizedBaseUrl(): string {
    return this.config.baseUrl.replace(/\/+$/, "");
  }
}
