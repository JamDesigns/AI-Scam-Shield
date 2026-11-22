import { afterEach, expect, it, vi } from "vitest";
import { OpenAiProvider } from "./providers/openai/openai-ai-provider.js";
import { OllamaAiProvider } from "./providers/ollama/ollama-ai-provider.js";
import { outputTokenLimit, tokenCount } from "./provider-usage.js";

const request = { prompt: "Synthetic", schema: { type: "object", properties: {}, required: [] } };
afterEach(() => vi.unstubAllGlobals());

it("keeps normalized token counts honest, including zero and missing counters", () => {
  expect(tokenCount(0)).toBe(0);
  for (const value of [undefined, null, "10", -1, Infinity, 0.5]) expect(tokenCount(value)).toBeUndefined();
  expect(outputTokenLimit(request)).toBe(4096);
  expect(outputTokenLimit(request, 2000)).toBe(2000);
  expect(outputTokenLimit({ ...request, maxOutputTokens: 1000 }, 2000)).toBe(1000);
});

it("reports OpenAI usage even when a capped response fails, without including the prompt", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: "incomplete", usage: {
    input_tokens: 100, output_tokens: 25, input_tokens_details: { cached_tokens: 10 }, output_tokens_details: { reasoning_tokens: 5 }, total_tokens: 125,
  } }) }));
  vi.stubGlobal("fetch", fetchMock);
  const onUsage = vi.fn();
  await expect(new OpenAiProvider({ baseUrl: "https://fixture.invalid", model: "fixture", apiKey: "synthetic", maxOutputTokens: 1000 })
    .requestJson({ ...request, onUsage })).rejects.toThrow("incomplete");
  expect(onUsage).toHaveBeenCalledWith({ provider: "openai", model: "fixture", inputTokens: 100, outputTokens: 25, cachedInputTokens: 10, reasoningTokens: 5, totalTokens: 125 });
  expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).max_output_tokens).toBe(1000);
});

it.each(["completion", "conversation"] as const)("caps and meters Ollama %s without treating truncated JSON as an assessment", async (mode) => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ response: "{}", message: { content: "{}" }, done_reason: "length", prompt_eval_count: 10, eval_count: 20 }) }));
  vi.stubGlobal("fetch", fetchMock);
  const onUsage = vi.fn();
  await expect(new OllamaAiProvider({ baseUrl: "http://fixture.invalid", model: "fixture" }).requestJson({ ...request, mode, maxOutputTokens: 50, onUsage })).rejects.toThrow("incomplete");
  expect(onUsage).toHaveBeenCalledWith({ provider: "ollama", model: "fixture", inputTokens: 10, outputTokens: 20, totalTokens: 30 });
  expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).options.num_predict).toBe(50);
});

it.each(["openai", "ollama"])("redacts %s HTTP errors without retaining sensitive upstream bodies", async (providerName) => {
  const readBody = vi.fn(async () => "synthetic-private-upstream-detail");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, text: readBody })));
  const provider = providerName === "openai" ? new OpenAiProvider({ baseUrl: "https://fixture.invalid", model: "fixture", apiKey: "synthetic" }) : new OllamaAiProvider({ baseUrl: "http://fixture.invalid", model: "fixture" });
  await expect(provider.requestJson(request)).rejects.not.toThrow("private-upstream");
  expect(readBody).not.toHaveBeenCalled();
});

it("omits OpenAI temperature by explicit capability configuration", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }] }) }));
  vi.stubGlobal("fetch", fetchMock);
  await new OpenAiProvider({ baseUrl: "https://fixture.invalid", model: "fixture", apiKey: "synthetic", sendTemperature: false }).requestJson({ ...request, temperature: 0.2 });
  expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).not.toHaveProperty("temperature");
});
