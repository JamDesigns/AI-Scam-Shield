import { describe, expect, it } from "vitest";

import { createAiProvider } from "./ai-provider-factory.js";

describe("createAiProvider", () => {
  it("creates an Ollama provider for local mode", () => {
    const provider = createAiProvider({
      provider: "ollama",
      mode: "local",
      model: "llama3.1:8b",
    });

    expect(provider).not.toBeNull();
    expect(provider?.name).toBe("ollama");
  });

  it("creates an Ollama provider for cloud mode when an API key is configured", () => {
    const provider = createAiProvider({
      provider: "ollama",
      mode: "cloud",
      model: "qwen3.5:397b",
      apiKey: "ollama-test-key",
    });

    expect(provider).not.toBeNull();
    expect(provider?.name).toBe("ollama");
  });

  it("does not create an Ollama cloud provider without an API key", () => {
    const provider = createAiProvider({
      provider: "ollama",
      mode: "cloud",
      model: "qwen3.5:397b",
    });

    expect(provider).toBeNull();
  });

  it("rejects unsupported Ollama modes", () => {
    expect(() =>
      createAiProvider({
        provider: "ollama",
        mode: "unsupported",
        model: "llama3.1:8b",
      }),
    ).toThrow('Unsupported Ollama mode "unsupported"');
  });

  it("creates an OpenAI provider when model and API key are configured", () => {
    const provider = createAiProvider({
      provider: "openai",
      model: "gpt-5.4-mini",
      apiKey: "openai-test-key",
    });

    expect(provider).not.toBeNull();
    expect(provider?.name).toBe("openai");
  });

  it("does not create an OpenAI provider without an API key", () => {
    const provider = createAiProvider({
      provider: "openai",
      model: "gpt-5.4-mini",
    });

    expect(provider).toBeNull();
  });

  it("rejects unsupported providers", () => {
    expect(() =>
      createAiProvider({
        provider: "unknown",
        model: "test-model",
      }),
    ).toThrow('Unsupported AI provider "unknown"');
  });
});
