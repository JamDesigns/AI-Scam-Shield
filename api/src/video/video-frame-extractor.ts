import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_FRAME_COUNT = 6;
const MAX_FRAME_WIDTH = 1024;
const JPEG_QUALITY = 4;

export type VideoFrame = {
  timestampSeconds: number;
  dataBase64: string;
  mimeType: "image/jpeg";
};

export function buildVideoSampleTimestamps(
  durationSeconds: number,
  frameCount = DEFAULT_FRAME_COUNT,
): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Video duration must be a positive finite number");
  }

  if (!Number.isInteger(frameCount) || frameCount <= 0) {
    throw new Error("Frame count must be a positive integer");
  }

  return Array.from({ length: frameCount }, (_, index) => {
    const timestamp =
      ((index + 0.5) / frameCount) * durationSeconds;

    return Number(timestamp.toFixed(3));
  });
}

export async function getVideoDurationSeconds(
  filePath: string,
): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  const durationSeconds = Number(stdout.trim());

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Unable to determine video duration");
  }

  return durationSeconds;
}

export async function extractVideoFrames(params: {
  filePath: string;
  frameCount?: number;
}): Promise<VideoFrame[]> {
  const durationSeconds = await getVideoDurationSeconds(
    params.filePath,
  );

  const timestamps = buildVideoSampleTimestamps(
    durationSeconds,
    params.frameCount,
  );

  const workingDirectory = await mkdtemp(
    join(tmpdir(), "scam-shield-video-"),
  );

  try {
    const frames: VideoFrame[] = [];

    for (const [index, timestampSeconds] of timestamps.entries()) {
      const outputPath = join(
        workingDirectory,
        `frame-${String(index + 1).padStart(2, "0")}.jpg`,
      );

      await execFileAsync("ffmpeg", [
        "-v",
        "error",
        "-ss",
        String(timestampSeconds),
        "-i",
        params.filePath,
        "-frames:v",
        "1",
        "-vf",
        `scale='min(${MAX_FRAME_WIDTH},iw)':-2`,
        "-q:v",
        String(JPEG_QUALITY),
        "-y",
        outputPath,
      ]);

      const image = await readFile(outputPath);

      frames.push({
        timestampSeconds,
        dataBase64: image.toString("base64"),
        mimeType: "image/jpeg",
      });
    }

    return frames;
  } finally {
    await rm(workingDirectory, {
      recursive: true,
      force: true,
    });
  }
}
