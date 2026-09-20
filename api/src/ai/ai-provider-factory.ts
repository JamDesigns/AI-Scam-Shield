import type { AiProvider } from "./ai-provider.js";
import { OllamaAiProvider } from "./providers/ollama/ollama-ai-provider.js";
import { OpenAiProvider } from "./providers/openai/openai-ai-provider.js";

export type AiProviderConfig = {
  provider: string;
  mode?: string;
  baseUrl?: string;
  model: string;
  apiKey?: string;
};

type AiProviderBuilder = (config: AiProviderConfig) => AiProvider | null;

const providerBuilders: Record<string, AiProviderBuilder> = {
  ollama: (config) => {
    const model = config.model.trim();

    if (!model) {
      return null;
    }

    const mode = config.mode?.trim().toLowerCase() || "local";

    if (mode !== "local" && mode !== "cloud") {
      throw new Error(`Unsupported Ollama mode "${config.mode}"`);
    }

    const baseUrl =
      config.baseUrl?.trim() ||
      (mode === "cloud"
        ? "https://ollama.com"
        : "http://host.docker.internal:11434");

    const apiKey = config.apiKey?.trim();

    if (mode === "cloud" && !apiKey) {
      return null;
    }

    return new OllamaAiProvider({
      baseUrl,
      model,
      apiKey: mode === "cloud" ? apiKey : undefined,
    });
  },
  openai: (config) => {
    const model = config.model.trim();
    const apiKey = config.apiKey?.trim();

    if (!model || !apiKey) {
      return null;
    }

    return new OpenAiProvider({
      baseUrl: config.baseUrl?.trim() || "https://api.openai.com/v1",
      model,
      apiKey,
    });
  },
};

export function createAiProvider(
  config: AiProviderConfig,
): AiProvider | null {
  const providerName = config.provider.trim().toLowerCase();
  const builder = providerBuilders[providerName];

  if (!builder) {
    throw new Error(`Unsupported AI provider "${config.provider}"`);
  }

  return builder(config);
}
