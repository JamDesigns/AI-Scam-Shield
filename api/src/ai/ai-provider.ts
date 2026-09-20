export type AiProviderMedia = {
  dataBase64: string;
  mimeType: string;
  filename?: string;
};

export type AiProviderInteractionMode = "completion" | "conversation";

export type AiProviderRequest = {
  system?: string;
  prompt: string;
  media?: AiProviderMedia[];
  schema: Record<string, unknown>;
  temperature?: number;
  mode?: AiProviderInteractionMode;
};

export interface AiProvider {
  readonly name: string;

  requestJson<T = unknown>(params: AiProviderRequest): Promise<T>;
}
