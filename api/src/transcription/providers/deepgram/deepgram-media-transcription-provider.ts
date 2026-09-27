import type {
  MediaTranscriptionProvider,
  MediaTranscriptionProviderMedia,
  MediaTranscriptionResult,
  MediaTranscriptionWord,
} from "../../media-transcription-provider.js";

export type DeepgramMediaTranscriptionProviderConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

type DeepgramWord = {
  word?: string;
  punctuated_word?: string;
  start?: number;
  end?: number;
  confidence?: number;
  language?: string;
};

type DeepgramAlternative = {
  transcript?: string;
  confidence?: number;
  languages?: string[];
  words?: DeepgramWord[];
};

type DeepgramChannel = {
  alternatives?: DeepgramAlternative[];
  detected_language?: string;
};

type DeepgramResponse = {
  metadata?: {
    request_id?: string;
  };
  results?: {
    channels?: DeepgramChannel[];
  };
};

export class DeepgramMediaTranscriptionProvider
  implements MediaTranscriptionProvider
{
  readonly name = "deepgram";

  constructor(
    private readonly config: DeepgramMediaTranscriptionProviderConfig,
  ) {}

  async transcribe(
    media: MediaTranscriptionProviderMedia,
  ): Promise<MediaTranscriptionResult> {
    if (
      !media.mimeType.startsWith("audio/") &&
      !media.mimeType.startsWith("video/")
    ) {
      throw new Error(
        `Deepgram provider does not support media type "${media.mimeType}"`,
      );
    }

    const url = new URL(`${this.normalizedBaseUrl}/listen`);

    url.searchParams.set("model", this.config.model);
    url.searchParams.set("language", "multi");
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("mip_opt_out", "true");

    const request: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: {
        Authorization: `Token ${this.config.apiKey}`,
        "content-type": media.mimeType,
        "content-length": String(media.sizeBytes),
      },
      body:
        media.createReadStream() as unknown as RequestInit["body"],
      duplex: "half",
    };

    const response = await fetch(url, request);

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      throw new Error(
        `Deepgram request failed (${response.status}): ${body}`,
      );
    }

    const body = (await response.json()) as DeepgramResponse;

    const channel = body.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];

    if (!alternative) {
      throw new Error(
        "Deepgram response did not include a transcription alternative",
      );
    }

    const languages = this.getLanguages(
      alternative,
      channel,
    );

    return {
      ...(typeof body.metadata?.request_id === "string" &&
      body.metadata.request_id.trim().length > 0
        ? { requestId: body.metadata.request_id }
        : {}),
      transcript:
        typeof alternative.transcript === "string"
          ? alternative.transcript.trim()
          : "",
      ...(typeof alternative.confidence === "number"
        ? { confidence: alternative.confidence }
        : {}),
      languages,
      words: (alternative.words ?? [])
        .map((word) => this.mapWord(word))
        .filter(
          (
            word,
          ): word is MediaTranscriptionWord => word !== null,
        ),
    };
  }

  private mapWord(
    word: DeepgramWord,
  ): MediaTranscriptionWord | null {
    const text =
      typeof word.punctuated_word === "string" &&
      word.punctuated_word.trim().length > 0
        ? word.punctuated_word.trim()
        : typeof word.word === "string"
          ? word.word.trim()
          : "";

    if (
      text.length === 0 ||
      typeof word.start !== "number" ||
      typeof word.end !== "number"
    ) {
      return null;
    }

    return {
      text,
      startSeconds: word.start,
      endSeconds: word.end,
      ...(typeof word.confidence === "number"
        ? { confidence: word.confidence }
        : {}),
      ...(typeof word.language === "string" &&
      word.language.trim().length > 0
        ? { language: word.language }
        : {}),
    };
  }

  private getLanguages(
    alternative: DeepgramAlternative,
    channel: DeepgramChannel | undefined,
  ): string[] {
    const languages = new Set<string>();

    for (const language of alternative.languages ?? []) {
      if (
        typeof language === "string" &&
        language.trim().length > 0
      ) {
        languages.add(language);
      }
    }

    if (
      typeof channel?.detected_language === "string" &&
      channel.detected_language.trim().length > 0
    ) {
      languages.add(channel.detected_language);
    }

    for (const word of alternative.words ?? []) {
      if (
        typeof word.language === "string" &&
        word.language.trim().length > 0
      ) {
        languages.add(word.language);
      }
    }

    return Array.from(languages);
  }

  private get normalizedBaseUrl(): string {
    return this.config.baseUrl.replace(/\/+$/, "");
  }
}
