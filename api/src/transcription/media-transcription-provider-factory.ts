import type { MediaTranscriptionProvider } from "./media-transcription-provider.js";
import { DeepgramMediaTranscriptionProvider } from "./providers/deepgram/deepgram-media-transcription-provider.js";

export type MediaTranscriptionProviderConfig = {
  provider: string;
  baseUrl?: string;
  model: string;
  apiKey?: string;
};

type MediaTranscriptionProviderBuilder = (
  config: MediaTranscriptionProviderConfig,
) => MediaTranscriptionProvider | null;

const providerBuilders: Record<
  string,
  MediaTranscriptionProviderBuilder
> = {
  deepgram: (config) => {
    const model = config.model.trim();
    const apiKey = config.apiKey?.trim();

    if (!model || !apiKey) {
      return null;
    }

    return new DeepgramMediaTranscriptionProvider({
      baseUrl:
        config.baseUrl?.trim() ||
        "https://api.eu.deepgram.com/v1",
      model,
      apiKey,
    });
  },
};

export function createMediaTranscriptionProvider(
  config: MediaTranscriptionProviderConfig,
): MediaTranscriptionProvider | null {
  const providerName = config.provider.trim().toLowerCase();
  const builder = providerBuilders[providerName];

  if (!builder) {
    throw new Error(
      `Unsupported media transcription provider "${config.provider}"`,
    );
  }

  return builder(config);
}
