export type AiProviderMedia = {
  dataBase64: string;
  mimeType: string;
  filename?: string;
};

export type AiProviderInteractionMode = "completion" | "conversation";

/** Provider-reported counters, not a price or an estimate of the user's quota. */
export type AiProviderUsage = {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

export type AiProviderRequest = {
  system?: string;
  outputLanguage?: string;
  prompt: string;
  media?: AiProviderMedia[];
  schema: Record<string, unknown>;
  temperature?: number;
  mode?: AiProviderInteractionMode;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputTokens?: number;
  /** Called even if reported token usage accompanies a blocked/invalid response. */
  onUsage?: (usage: AiProviderUsage) => void;
};

export interface AiProvider {
  readonly name: string;
  /** Local providers can analyse in one language, then translate narrative only. */
  readonly generationLanguage?: string;

  requestJson<T = unknown>(params: AiProviderRequest): Promise<T>;
}
