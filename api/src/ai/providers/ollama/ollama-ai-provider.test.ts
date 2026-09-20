import { afterEach, describe, expect, it, vi } from "vitest";

import { OllamaAiProvider } from "./ollama-ai-provider.js";

describe("OllamaAiProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses /api/generate for completion requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({ result: "ok" }),
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaAiProvider({
      baseUrl: "http://ollama.local/",
      model: "test-model",
    });

    const result = await provider.requestJson<{ result: string }>({
      mode: "completion",
      system: "System instruction",
      prompt: "Test prompt",
      schema: {
        type: "object",
        properties: {
          result: { type: "string" },
        },
        required: ["result"],
      },
      temperature: 0.2,
    });

    expect(result).toEqual({ result: "ok" });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(url).toBe("http://ollama.local/api/generate");
    expect(body).toMatchObject({
      model: "test-model",
      system: "System instruction",
      prompt: "Test prompt",
      stream: false,
      options: {
        temperature: 0.2,
      },
    });
    expect(body.format.required).toEqual(["result"]);
  });

  it("uses /api/chat for conversation requests with images", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({ result: "ok" }),
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaAiProvider({
      baseUrl: "http://ollama.local",
      model: "vision-model",
    });

    const result = await provider.requestJson<{ result: string }>({
      mode: "conversation",
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
          result: { type: "string" },
        },
        required: ["result"],
      },
    });

    expect(result).toEqual({ result: "ok" });

    const [url, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(url).toBe("http://ollama.local/api/chat");
    expect(body.model).toBe("vision-model");
    expect(body.messages).toEqual([
      {
        role: "system",
        content: "System instruction",
      },
      {
        role: "user",
        content: "Inspect this image",
        images: ["base64-image-content"],
      },
    ]);
    expect(body.options.temperature).toBe(0.1);
  });

  it("adds the bearer token when an API key is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({ result: "ok" }),
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaAiProvider({
      baseUrl: "https://ollama.com",
      model: "test-model",
      apiKey: "test-api-key",
    });

    await provider.requestJson({
      mode: "completion",
      prompt: "Test",
      schema: {
        type: "object",
        properties: {},
        required: [],
      },
    });

    const [, request] = fetchMock.mock.calls[0];

    expect(request.headers.Authorization).toBe("Bearer test-api-key");
  });

  it("rejects unsupported media types", async () => {
    const provider = new OllamaAiProvider({
      baseUrl: "http://ollama.local",
      model: "test-model",
    });

    await expect(
      provider.requestJson({
        mode: "conversation",
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
      'Ollama provider does not support media type "video/mp4"',
    );
  });

  it("throws when Ollama returns an HTTP error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service unavailable",
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaAiProvider({
      baseUrl: "http://ollama.local",
      model: "test-model",
    });

    await expect(
      provider.requestJson({
        mode: "completion",
        prompt: "Test",
        schema: {
          type: "object",
          properties: {},
          required: [],
        },
      }),
    ).rejects.toThrow(
      "Ollama request failed (503): Service unavailable",
    );
  });

  it("throws when Ollama returns invalid JSON content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: "not-json",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaAiProvider({
      baseUrl: "http://ollama.local",
      model: "test-model",
    });

    await expect(
      provider.requestJson({
        mode: "completion",
        prompt: "Test",
        schema: {
          type: "object",
          properties: {},
          required: [],
        },
      }),
    ).rejects.toThrow("Ollama response was not valid JSON");
  });
});
