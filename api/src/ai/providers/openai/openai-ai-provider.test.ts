import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAiProvider } from "./openai-ai-provider.js";

describe("OpenAiProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the Responses API and returns parsed structured JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ result: "ok" }),
              },
            ],
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiProvider({
      baseUrl: "https://api.openai.com/v1/",
      model: "test-model",
      apiKey: "test-api-key",
    });

    const result = await provider.requestJson<{ result: string }>({
      prompt: "Test prompt",
      schema: {
        type: "object",
        properties: {
          result: {
            type: "string",
          },
        },
        required: ["result"],
      },
    });

    expect(result).toEqual({ result: "ok" });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(request.headers.Authorization).toBe("Bearer test-api-key");
    expect(body.model).toBe("test-model");
    expect(body.store).toBe(false);
    expect(body.input[0]).toEqual({
      role: "user",
      content: [
        {
          type: "input_text",
          text: "Test prompt",
        },
      ],
    });
  });

  it("sends system instructions and images", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ result: "ok" }),
              },
            ],
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiProvider({
      baseUrl: "https://api.openai.com/v1",
      model: "vision-model",
      apiKey: "test-api-key",
    });

    await provider.requestJson({
      system: "System instruction",
      prompt: "Inspect this image",
      media: [
        {
          dataBase64: "base64-image-content",
          mimeType: "image/jpeg",
        },
      ],
      schema: {
        type: "object",
        properties: {
          result: {
            type: "string",
          },
        },
        required: ["result"],
      },
    });

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(body.input[0]).toEqual({
      role: "system",
      content: "System instruction",
    });

    expect(body.input[1]).toEqual({
      role: "user",
      content: [
        {
          type: "input_text",
          text: "Inspect this image",
        },
        {
          type: "input_image",
          image_url: "data:image/jpeg;base64,base64-image-content",
        },
      ],
    });
  });

  it("adapts the JSON schema for strict structured output", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  result: "ok",
                  details: {
                    confidence: "high",
                  },
                }),
              },
            ],
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiProvider({
      baseUrl: "https://api.openai.com/v1",
      model: "test-model",
      apiKey: "test-api-key",
    });

    await provider.requestJson({
      prompt: "Test",
      schema: {
        type: "object",
        properties: {
          result: {
            type: "string",
          },
          details: {
            type: "object",
            properties: {
              confidence: {
                type: "string",
              },
            },
            required: ["confidence"],
          },
        },
        required: ["result", "details"],
      },
    });

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);

    expect(body.text.format.schema.additionalProperties).toBe(false);
    expect(
      body.text.format.schema.properties.details.additionalProperties,
    ).toBe(false);
  });

  it("rejects schemas with optional object properties", async () => {
    const provider = new OpenAiProvider({
      baseUrl: "https://api.openai.com/v1",
      model: "test-model",
      apiKey: "test-api-key",
    });

    await expect(
      provider.requestJson({
        prompt: "Test",
        schema: {
          type: "object",
          properties: {
            requiredValue: {
              type: "string",
            },
            optionalValue: {
              type: "string",
            },
          },
          required: ["requiredValue"],
        },
      }),
    ).rejects.toThrow(
      "OpenAI structured output requires every object property to be required",
    );
  });

  it("rejects unsupported media types", async () => {
    const provider = new OpenAiProvider({
      baseUrl: "https://api.openai.com/v1",
      model: "test-model",
      apiKey: "test-api-key",
    });

    await expect(
      provider.requestJson({
        prompt: "Analyze media",
        media: [
          {
            dataBase64: "video-content",
            mimeType: "video/mp4",
          },
        ],
        schema: {
          type: "object",
          properties: {},
          required: [],
        },
      }),
    ).rejects.toThrow(
      'OpenAI provider does not support media type "video/mp4" in this integration',
    );
  });

  it("throws when OpenAI returns an HTTP error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Insufficient quota",
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiProvider({
      baseUrl: "https://api.openai.com/v1",
      model: "test-model",
      apiKey: "test-api-key",
    });

    await expect(
      provider.requestJson({
        prompt: "Test",
        schema: {
          type: "object",
          properties: {},
          required: [],
        },
      }),
    ).rejects.toThrow(
      "OpenAI request failed (429): Insufficient quota",
    );
  });

  it("throws when OpenAI refuses the request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "refusal",
                refusal: "Request refused",
              },
            ],
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiProvider({
      baseUrl: "https://api.openai.com/v1",
      model: "test-model",
      apiKey: "test-api-key",
    });

    await expect(
      provider.requestJson({
        prompt: "Test",
        schema: {
          type: "object",
          properties: {},
          required: [],
        },
      }),
    ).rejects.toThrow("OpenAI refused the request: Request refused");
  });
});
