import { beforeEach, describe, expect, it, vi } from "vitest";

const runMediaCommand = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({
  execFile: Object.assign(() => undefined, {
    [Symbol.for("nodejs.util.promisify.custom")]: runMediaCommand,
  }),
}));

import { createLocalAnalyzer } from "./local-analysis.js";

function completion(data: unknown, finishReason = "stop"): Response {
  return Response.json({
    choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(data) } }],
  });
}

function setup() {
  const fetchImpl = vi.fn<typeof fetch>();
  const analyzer = createLocalAnalyzer({
    baseUrl: "http://host.docker.internal:8080/v1/",
    model: "gemma-4-e4b",
    speechBaseUrl: "http://host.docker.internal:8081",
    fetchImpl,
  });
  return { ...analyzer, fetchImpl };
}

describe("local analysis", () => {
  beforeEach(() => runMediaCommand.mockReset());

  it("rejects external endpoints, user information and paths outside the local API", () => {
    for (const baseUrl of [
      "https://api.openai.com/v1",
      "http://localhost@external.example",
      "http://name:password@localhost",
      "http://localhost/another-api",
    ]) {
      expect(() => createLocalAnalyzer({ baseUrl, model: "gemma-4-e4b" })).toThrow();
    }
  });

  it("uses llama-server structured chat for an image and blocks redirects", async () => {
    const { provider, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(completion({ riskScore: 92 }));
    const schema = { type: "object" };
    await expect(provider.requestJson({
      prompt: "Assess risk",
      media: [{ mimeType: "image/jpeg", dataBase64: "YWJj" }],
      schema,
    })).resolves.toEqual({ riskScore: 92 });
    const [url, request] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("http://host.docker.internal:8080/v1/chat/completions");
    expect(request?.redirect).toBe("error");
    expect(JSON.parse(String(request?.body))).toMatchObject({
      max_tokens: 2048,
      chat_template_kwargs: { enable_thinking: false },
      grammar: expect.stringContaining("root ::= jsonobject"),
      messages: [
        { role: "system", content: expect.stringContaining("untrusted evidence") },
        { role: "user", content: [
          { type: "image_url", image_url: { url: "data:image/jpeg;base64,YWJj" } },
          { type: "text", text: "Assess risk" },
        ] },
      ],
    });
  });

  it("rejects a truncated reply and propagates request cancellation", async () => {
    const { provider, fetchImpl } = setup();
    fetchImpl.mockResolvedValueOnce(completion({ riskScore: 0 }, "length"));
    await expect(provider.requestJson({ prompt: "Assess risk", schema: {} })).rejects.toThrow("incomplete");
    const controller = new AbortController();
    fetchImpl.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
    }));
    const request = provider.requestJson({ prompt: "Assess risk", schema: {}, signal: controller.signal });
    controller.abort(new Error("Client disconnected"));
    await expect(request).rejects.toThrow("Client disconnected");
    expect(fetchImpl.mock.calls[1][1]?.signal?.aborted).toBe(true);
  });

  it("keeps the text budget small and still rejects truncated multimodal JSON", async () => {
    const { provider, fetchImpl } = setup();
    fetchImpl.mockResolvedValueOnce(completion({ riskScore: 0 }));
    await provider.requestJson({ prompt: "Assess text", schema: {} });
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).max_tokens).toBe(1024);
    fetchImpl.mockResolvedValueOnce(completion({ riskScore: 0 }, "length"));
    await expect(provider.requestJson({ prompt: "Assess media", schema: {},
      media: [{ mimeType: "image/jpeg", dataBase64: "YWJj" }],
    })).rejects.toThrow("incomplete");
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body)).max_tokens).toBe(2048);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns an empty transcript for a silent video without contacting the model", async () => {
    const { transcribeVideo, fetchImpl } = setup();
    runMediaCommand.mockResolvedValueOnce({ stdout: "" });
    await expect(transcribeVideo({ filePath: "silent.mp4", durationSeconds: 10 })).resolves.toEqual({
      transcript: "", languages: [],
      speechDetected: false, transcriptionStatus: "no_speech",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("bounds each WAV input and keeps transcripts in clip order", async () => {
    const { transcribeVideo, fetchImpl } = setup();
    runMediaCommand.mockResolvedValueOnce({ stdout: "1\n" })
      .mockResolvedValueOnce({ stdout: Buffer.alloc(26 * 16_000 * 2) });
    fetchImpl.mockResolvedValueOnce(Response.json({ provider: "silero-vad", sampleRate: 16000,
      analyzedSeconds: 26, speechIntervals: [{ startSeconds: 0, endSeconds: 26 }] }))
      .mockResolvedValueOnce(completion({ transcript: "First segment." }))
      .mockResolvedValueOnce(completion({ transcript: "Second segment." }));
    const result = await transcribeVideo({ filePath: "fixture.mp4", durationSeconds: 26 });
    expect(result).toEqual({ transcript: "First segment.\nSecond segment.", languages: [], speechDetected: true, transcriptionStatus: "transcribed" });
    const audioBytes = fetchImpl.mock.calls.slice(1).map(([, request]) => {
      const audio = JSON.parse(String(request?.body)).messages[1].content[0];
      expect(audio.type).toBe("input_audio");
      const wav = Buffer.from(audio.input_audio.data, "base64");
      expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
      expect(wav.readUInt32LE(24)).toBe(16_000);
      expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
      return wav.length - 44;
    });
    expect(audioBytes).toEqual([25 * 16_000 * 2, 16_000 * 2]);
  });

  it("does not send tones classified as non-speech to Gemma", async () => {
    const { transcribeVideo, fetchImpl } = setup();
    runMediaCommand.mockResolvedValueOnce({ stdout: "1\n" }).mockResolvedValueOnce({ stdout: Buffer.alloc(23 * 16000 * 2) });
    fetchImpl.mockResolvedValueOnce(Response.json({ provider: "silero-vad", sampleRate: 16000, analyzedSeconds: 23, speechIntervals: [] }));
    await expect(transcribeVideo({ filePath: "tones.mp4", durationSeconds: 23 })).resolves.toEqual({
      transcript: "", languages: [], speechDetected: false, transcriptionStatus: "no_speech",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://host.docker.internal:8081/speech");
    expect(fetchImpl.mock.calls[0][1]?.redirect).toBe("error");
  });

  it("fails recoverably rather than bypassing an absent, stopped or inconsistent gate", async () => {
    for (const gate of ["absent", "unavailable", "inconsistent"] as const) {
      runMediaCommand.mockResolvedValueOnce({ stdout: "1\n" }).mockResolvedValueOnce({ stdout: Buffer.alloc(16000 * 2) });
      const fetchImpl = vi.fn<typeof fetch>();
      if (gate === "unavailable") fetchImpl.mockResolvedValueOnce(new Response(null, { status: 503 }));
      if (gate === "inconsistent") fetchImpl.mockResolvedValueOnce(Response.json({ provider: "silero-vad", sampleRate: 16000,
        analyzedSeconds: 1, speechIntervals: [{ startSeconds: 0, endSeconds: 2 }] }));
      const analyzer = createLocalAnalyzer({ baseUrl: "http://127.0.0.1:18080", model: "test", fetchImpl,
        ...(gate === "absent" ? {} : { speechBaseUrl: "http://127.0.0.1:8081" }) });
      await expect(analyzer.transcribeVideo({ filePath: "speech.mp4", durationSeconds: 1 })).rejects.toThrow();
      expect(fetchImpl).toHaveBeenCalledTimes(gate === "absent" ? 0 : 1);
    }
  });

  it("keeps voiced but unintelligible audio distinct from no speech", async () => {
    const { transcribeVideo, fetchImpl } = setup();
    runMediaCommand.mockResolvedValueOnce({ stdout: "1\n" }).mockResolvedValueOnce({ stdout: Buffer.alloc(16000 * 2) });
    fetchImpl.mockResolvedValueOnce(Response.json({ provider: "silero-vad", sampleRate: 16000, analyzedSeconds: 1,
      speechIntervals: [{ startSeconds: .1, endSeconds: .9 }] })).mockResolvedValueOnce(completion({ transcript: "" }));
    await expect(transcribeVideo({ filePath: "unintelligible.mp4", durationSeconds: 1 })).resolves.toEqual({
      transcript: "", languages: [], speechDetected: true, transcriptionStatus: "unintelligible",
    });
  });

  it("preserves genuine spoken apologies rather than applying a transcript blacklist", async () => {
    const { transcribeVideo, fetchImpl } = setup();
    runMediaCommand.mockResolvedValueOnce({ stdout: "1\n" }).mockResolvedValueOnce({ stdout: Buffer.alloc(16000 * 2) });
    fetchImpl.mockResolvedValueOnce(Response.json({ provider: "silero-vad", sampleRate: 16000, analyzedSeconds: 1,
      speechIntervals: [{ startSeconds: 0, endSeconds: 1 }] }))
      .mockResolvedValueOnce(completion({ transcript: "I'm sorry, I couldn't understand the speech." }));
    const result = await transcribeVideo({ filePath: "spoken-apology.mp4", durationSeconds: 1 });
    expect(result.transcript).toBe("I'm sorry, I couldn't understand the speech.");
    expect(result.transcriptionStatus).toBe("transcribed");
  });

  it("skips unvoiced leading chunks and retains delayed speech in its original order", async () => {
    const { transcribeVideo, fetchImpl } = setup();
    runMediaCommand.mockResolvedValueOnce({ stdout: "1\n" }).mockResolvedValueOnce({ stdout: Buffer.alloc(30 * 16000 * 2) });
    fetchImpl.mockResolvedValueOnce(Response.json({ provider: "silero-vad", sampleRate: 16000, analyzedSeconds: 30,
      speechIntervals: [{ startSeconds: 27, endSeconds: 29 }] })).mockResolvedValueOnce(completion({ transcript: "Una frase tardía." }));
    const result = await transcribeVideo({ filePath: "delayed.mp4", durationSeconds: 30 });
    expect(result.transcript).toBe("Una frase tardía.");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const wav = Buffer.from(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body)).messages[1].content[0].input_audio.data, "base64");
    expect(wav.readUInt32LE(40)).toBe(2 * 16000 * 2);
  });

  it("cancels a waiting voice gate without starting semantic transcription", async () => {
    const { transcribeVideo, fetchImpl } = setup();
    runMediaCommand.mockResolvedValueOnce({ stdout: "1\n" }).mockResolvedValueOnce({ stdout: Buffer.alloc(16000 * 2) });
    const controller = new AbortController();
    fetchImpl.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
      controller.abort(new Error("Video cancelled"));
    }));
    await expect(transcribeVideo({ filePath: "cancelled.mp4", durationSeconds: 1, signal: controller.signal })).rejects.toThrow("Video cancelled");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
