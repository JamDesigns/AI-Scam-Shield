import { describe, expect, it } from "vitest";

import { DeepgramMediaTranscriptionProvider } from "./providers/deepgram/deepgram-media-transcription-provider.js";
import { createMediaTranscriptionProvider } from "./media-transcription-provider-factory.js";

describe("createMediaTranscriptionProvider", () => {
  it("creates a Deepgram provider", () => {
    const provider = createMediaTranscriptionProvider({
      provider: "deepgram",
      baseUrl: "https://api.eu.deepgram.com/v1",
      model: "nova-3",
      apiKey: "deepgram-test-key",
    });

    expect(provider).toBeInstanceOf(
      DeepgramMediaTranscriptionProvider,
    );
    expect(provider?.name).toBe("deepgram");
  });

  it("uses Deepgram default base URL", () => {
    const provider = createMediaTranscriptionProvider({
      provider: "deepgram",
      model: "nova-3",
      apiKey: "deepgram-test-key",
    });

    expect(provider).toBeInstanceOf(
      DeepgramMediaTranscriptionProvider,
    );
  });

  it("returns null when the model is empty", () => {
    const provider = createMediaTranscriptionProvider({
      provider: "deepgram",
      model: "   ",
      apiKey: "deepgram-test-key",
    });

    expect(provider).toBeNull();
  });

  it("returns null when the API key is missing", () => {
    const provider = createMediaTranscriptionProvider({
      provider: "deepgram",
      model: "nova-3",
    });

    expect(provider).toBeNull();
  });

  it("rejects unsupported providers", () => {
    expect(() =>
      createMediaTranscriptionProvider({
        provider: "unknown",
        model: "model",
        apiKey: "key",
      }),
    ).toThrow(
      'Unsupported media transcription provider "unknown"',
    );
  });
});
