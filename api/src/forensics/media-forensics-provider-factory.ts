import type { MediaForensicsProvider } from "./media-forensics-provider.js";
import { HiveMediaForensicsProvider } from "./providers/hive/hive-media-forensics-provider.js";

export type MediaForensicsProviderConfig = {
  provider: string;
  baseUrl?: string;
  model: string;
  apiKey?: string;
};

type MediaForensicsProviderBuilder = (
  config: MediaForensicsProviderConfig,
) => MediaForensicsProvider | null;

const providerBuilders: Record<
  string,
  MediaForensicsProviderBuilder
> = {
  hive: (config) => {
    const model = config.model.trim();
    const apiKey = config.apiKey?.trim();

    if (!model || !apiKey) {
      return null;
    }

    return new HiveMediaForensicsProvider({
      baseUrl:
        config.baseUrl?.trim() ||
        "https://api.thehive.ai/api/v3",
      model,
      apiKey,
    });
  },
};

export function createMediaForensicsProvider(
  config: MediaForensicsProviderConfig,
): MediaForensicsProvider | null {
  const providerName = config.provider.trim().toLowerCase();
  const builder = providerBuilders[providerName];

  if (!builder) {
    throw new Error(
      `Unsupported media forensics provider "${config.provider}"`,
    );
  }

  return builder(config);
}
