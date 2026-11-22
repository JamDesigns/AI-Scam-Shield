import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import { withDeadline } from "../../../runtime-deadline.js";

import type {
  MediaForensicsObservation,
  MediaForensicsProvider,
  MediaForensicsProviderMedia,
  MediaForensicsProviderResult,
} from "../../media-forensics-provider.js";

export type HiveMediaForensicsProviderConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

type HiveClass = {
  class?: string;
  value?: number;
};

type HiveExtra = {
  name?: string;
  value?: number;
};

type HiveOutput = {
  extra?: HiveExtra[];
  classes?: HiveClass[];
};

type HiveResponse = {
  task_id?: string;
  output?: HiveOutput[];
};

const RESERVED_CLASSES = new Set([
  "not_ai_generated",
  "ai_generated",
  "deepfake",
  "not_ai_generated_audio",
  "ai_generated_audio",
  "none",
  "inconclusive",
  "inconclusive_video",
  "inconclusive_audio",
]);

const hiveOutputSchema = z.array(z.object({
  classes: z.array(z.object({
    class: z.string().min(1),
    value: z.number().finite().min(0).max(1),
  }).passthrough()).min(1),
  extra: z.array(z.object({ name: z.string(), value: z.number().finite() }).passthrough()).optional(),
}).passthrough()).min(1);

export class HiveMediaForensicsProvider
  implements MediaForensicsProvider
{
  readonly name = "hive";

  constructor(
    private readonly config: HiveMediaForensicsProviderConfig,
  ) {}

  async analyze(
    media: MediaForensicsProviderMedia,
  ): Promise<MediaForensicsProviderResult> {
    return withDeadline((signal) => this.performAnalysis({ ...media, signal }), media, "Hive request", 45_000);
  }

  private async performAnalysis(media: MediaForensicsProviderMedia): Promise<MediaForensicsProviderResult> {
    if (
      !media.mimeType.startsWith("image/") &&
      !media.mimeType.startsWith("video/") &&
      !media.mimeType.startsWith("audio/")
    ) {
      throw new Error(
        `Hive provider does not support media type "${media.mimeType}"`,
      );
    }

    const multipart = this.buildMultipartBody(media);

    const request: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "content-type": multipart.contentType,
        "content-length": String(multipart.contentLength),
      },
      body: multipart.body as unknown as RequestInit["body"],
      duplex: "half",
      signal: media.signal,
    };

    const response = await fetch(
      `${this.normalizedBaseUrl}/${this.config.model}`,
      request,
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      throw new Error(
        `Hive request failed (${response.status}): ${body}`,
      );
    }

    const body = (await response.json()) as HiveResponse;

    if (
      typeof body.task_id !== "string" ||
      body.task_id.trim().length === 0
    ) {
      throw new Error("Hive response did not include a task_id");
    }

    if (!Array.isArray(body.output) || body.output.length === 0) {
      throw new Error("Hive response did not include output");
    }

    if (!hiveOutputSchema.safeParse(body.output).success) {
      throw new Error("Hive response contained invalid observations");
    }

    return {
      status: "completed",
      submissionId: body.task_id,
      observations: body.output.map((output) =>
        this.mapObservation(output),
      ),
    };
  }

  private mapObservation(
    output: HiveOutput,
  ): MediaForensicsObservation {
    const classes = new Map<string, number>();

    for (const item of output.classes ?? []) {
      if (
        typeof item.class === "string" &&
        typeof item.value === "number"
      ) {
        classes.set(item.class, item.value);
      }
    }

    const frameIndex = this.getExtraValue(
      output.extra,
      "frame_index",
    );

    const timestampSeconds = this.getExtraValue(
      output.extra,
      "timestamp",
    );

    if (frameIndex !== undefined && (!Number.isInteger(frameIndex) || frameIndex < 0)
      || timestampSeconds !== undefined && timestampSeconds < 0) {
      throw new Error("Hive response contained invalid observation timestamps");
    }

    const generatorScores = Array.from(classes.entries())
      .filter(([name]) => !RESERVED_CLASSES.has(name))
      .map(([name, score]) => ({
        name,
        score,
      }));

    return {
      ...(classes.has("inconclusive")
        ? { inconclusive: classes.get("inconclusive")! >= 0.5 } : {}),
      ...(classes.has("inconclusive_video")
        ? { videoInconclusive: classes.get("inconclusive_video")! >= 0.5 } : {}),
      ...(classes.has("inconclusive_audio")
        ? { audioInconclusive: classes.get("inconclusive_audio")! >= 0.5 } : {}),
      ...(frameIndex !== undefined ? { frameIndex } : {}),
      ...(timestampSeconds !== undefined
        ? { timestampSeconds }
        : {}),
      ...(classes.has("ai_generated")
        ? {
            aiGeneratedScore: classes.get("ai_generated"),
          }
        : {}),
      ...(classes.has("not_ai_generated")
        ? {
            notAiGeneratedScore: classes.get(
              "not_ai_generated",
            ),
          }
        : {}),
      ...(classes.has("deepfake")
        ? {
            deepfakeScore: classes.get("deepfake"),
          }
        : {}),
      ...(classes.has("ai_generated_audio")
        ? {
            aiGeneratedAudioScore: classes.get(
              "ai_generated_audio",
            ),
          }
        : {}),
      ...(classes.has("not_ai_generated_audio")
        ? {
            notAiGeneratedAudioScore: classes.get(
              "not_ai_generated_audio",
            ),
          }
        : {}),
      ...(generatorScores.length > 0
        ? { generatorScores }
        : {}),
    };
  }

  private getExtraValue(
    extra: HiveExtra[] | undefined,
    name: string,
  ): number | undefined {
    const value = extra?.find(
      (item) => item.name === name,
    )?.value;

    return typeof value === "number" ? value : undefined;
  }

  private buildMultipartBody(
    media: MediaForensicsProviderMedia,
  ): {
    body: Readable;
    contentType: string;
    contentLength: number;
  } {
    const boundary =
      `----scamshield-${randomBytes(16).toString("hex")}`;

    const safeFilename = media.filename.replace(
      /[\r\n"]/g,
      "_",
    );

    const prefix =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="media"; filename="${safeFilename}"\r\n` +
      `Content-Type: ${media.mimeType}\r\n\r\n`;

    const suffix = `\r\n--${boundary}--\r\n`;

    const body = Readable.from(
      (async function* () {
        yield Buffer.from(prefix);

        for await (const chunk of media.createReadStream()) {
          yield chunk;
        }

        yield Buffer.from(suffix);
      })(),
    );

    return {
      body,
      contentType: `multipart/form-data; boundary=${boundary}`,
      contentLength:
        Buffer.byteLength(prefix) +
        media.sizeBytes +
        Buffer.byteLength(suffix),
    };
  }

  private get normalizedBaseUrl(): string {
    return this.config.baseUrl.replace(/\/+$/, "");
  }
}
