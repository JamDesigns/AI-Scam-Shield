import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeepgramMediaTranscriptionProvider } from "./deepgram-media-transcription-provider.js";

describe("DeepgramMediaTranscriptionProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends media to Deepgram and maps the transcription response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        metadata: {
          request_id: "deepgram-request-123",
        },
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "Hola, esto es una prueba.",
                  confidence: 0.97,
                  languages: ["es"],
                  words: [
                    {
                      word: "hola",
                      punctuated_word: "Hola,",
                      start: 0.1,
                      end: 0.4,
                      confidence: 0.99,
                      language: "es",
                    },
                    {
                      word: "esto",
                      punctuated_word: "esto",
                      start: 0.5,
                      end: 0.7,
                      confidence: 0.96,
                      language: "es",
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new DeepgramMediaTranscriptionProvider({
      baseUrl: "https://api.eu.deepgram.com/v1/",
      model: "nova-3",
      apiKey: "deepgram-test-key",
    });

    const result = await provider.transcribe({
      filename: "test.mp4",
      mimeType: "video/mp4",
      sizeBytes: 5,
      createReadStream: () =>
        Readable.from(Buffer.from("video")),
    });

    expect(result).toEqual({
      requestId: "deepgram-request-123",
      transcript: "Hola, esto es una prueba.",
      confidence: 0.97,
      languages: ["es"],
      words: [
        {
          text: "Hola,",
          startSeconds: 0.1,
          endSeconds: 0.4,
          confidence: 0.99,
          language: "es",
        },
        {
          text: "esto",
          startSeconds: 0.5,
          endSeconds: 0.7,
          confidence: 0.96,
          language: "es",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, request] = fetchMock.mock.calls[0];

    expect(url.toString()).toBe(
      "https://api.eu.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true&mip_opt_out=true",
    );
    expect(request.method).toBe("POST");
    expect(request.headers.Authorization).toBe(
      "Token deepgram-test-key",
    );
    expect(request.headers["content-type"]).toBe("video/mp4");
    expect(request.headers["content-length"]).toBe("5");
  });

  it("collects detected languages from channel and words", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          channels: [
            {
              detected_language: "es",
              alternatives: [
                {
                  transcript: "Hola hello",
                  words: [
                    {
                      word: "hola",
                      start: 0,
                      end: 0.3,
                      language: "es",
                    },
                    {
                      word: "hello",
                      start: 0.4,
                      end: 0.7,
                      language: "en",
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new DeepgramMediaTranscriptionProvider({
      baseUrl: "https://api.eu.deepgram.com/v1",
      model: "nova-3",
      apiKey: "deepgram-test-key",
    });

    const result = await provider.transcribe({
      filename: "test.webm",
      mimeType: "video/webm",
      sizeBytes: 5,
      createReadStream: () =>
        Readable.from(Buffer.from("video")),
    });

    expect(result.languages).toEqual(["es", "en"]);
  });

  it("rejects unsupported media types", async () => {
    const provider = new DeepgramMediaTranscriptionProvider({
      baseUrl: "https://api.eu.deepgram.com/v1",
      model: "nova-3",
      apiKey: "deepgram-test-key",
    });

    await expect(
      provider.transcribe({
        filename: "image.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 5,
        createReadStream: () =>
          Readable.from(Buffer.from("image")),
      }),
    ).rejects.toThrow(
      'Deepgram provider does not support media type "image/jpeg"',
    );
  });

  it("throws when Deepgram returns an HTTP error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Invalid credentials",
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new DeepgramMediaTranscriptionProvider({
      baseUrl: "https://api.eu.deepgram.com/v1",
      model: "nova-3",
      apiKey: "deepgram-test-key",
    });

    await expect(
      provider.transcribe({
        filename: "test.mp4",
        mimeType: "video/mp4",
        sizeBytes: 5,
        createReadStream: () =>
          Readable.from(Buffer.from("video")),
      }),
    ).rejects.toThrow(
      "Deepgram request failed (401): Invalid credentials",
    );
  });

  it("rejects a response without a transcription alternative", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          channels: [],
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new DeepgramMediaTranscriptionProvider({
      baseUrl: "https://api.eu.deepgram.com/v1",
      model: "nova-3",
      apiKey: "deepgram-test-key",
    });

    await expect(
      provider.transcribe({
        filename: "test.mp4",
        mimeType: "video/mp4",
        sizeBytes: 5,
        createReadStream: () =>
          Readable.from(Buffer.from("video")),
      }),
    ).rejects.toThrow(
      "Deepgram response did not include a transcription alternative",
    );
  });
});
