import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { withDeadline, type DeadlineOptions } from "../runtime-deadline.js";

const execFileAsync = promisify(execFile);
export const MAX_VIDEO_DURATION_SECONDS = 180;
export const MAX_VIDEO_SAMPLE_FRAMES = 14;
const MAX_FRAME_DIMENSION = 1024;
export const VIDEO_SCREENING_FPS = 8;
export const VIDEO_SCREENING_DIMENSION = 160;
const SCREENING_FRAME_BYTES = VIDEO_SCREENING_DIMENSION ** 2;
const MAX_SCREENING_FRAMES = Math.ceil(MAX_VIDEO_DURATION_SECONDS * VIDEO_SCREENING_FPS) + 1;
const MAX_SCREENING_BYTES = MAX_SCREENING_FRAMES * SCREENING_FRAME_BYTES;
const MIN_VISUAL_CHANGE = 0.002;
const MAX_CHANGE_INTERVALS = 128;
const MAX_ADAPTIVE_FRAMES = 4;

export type VideoFrame = {
  timestampSeconds: number;
  dataBase64: string;
  mimeType: "image/jpeg";
};

/** Bounded partial coverage, including the beginning and a decodable near-end frame. */
export function buildVideoSampleTimestamps(durationSeconds: number, frameCount?: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Video duration must be a positive finite number");
  }
  const count = frameCount ?? Math.min(MAX_VIDEO_SAMPLE_FRAMES, Math.max(6, Math.ceil(durationSeconds / 15) + 2));
  if (!Number.isInteger(count) || count <= 0 || count > MAX_VIDEO_SAMPLE_FRAMES) {
    throw new Error(`Frame count must be a positive integer no greater than ${MAX_VIDEO_SAMPLE_FRAMES}`);
  }
  if (count === 1) return [Number((durationSeconds / 2).toFixed(3))];
  const nearEnd = durationSeconds - Math.min(0.1, durationSeconds / 10);
  return [...new Set(Array.from({ length: count }, (_, index) =>
    Number((index * nearEnd / (count - 1)).toFixed(3))))];
}

function frameDifference(raw: Buffer, first: number, second: number): number {
  const a = first * SCREENING_FRAME_BYTES, b = second * SCREENING_FRAME_BYTES;
  let difference = 0;
  for (let offset = 0; offset < SCREENING_FRAME_BYTES; offset++) {
    difference += Math.abs(raw[a + offset] - raw[b + offset]);
  }
  return difference / (SCREENING_FRAME_BYTES * 255);
}

/**
 * Add novel visual intervals that uniform timestamps would omit, including brief overlays.
 * This remains bounded partial coverage, not proof that every frame has been inspected by AI.
 * `frameCount`, when explicit, remains a hard limit; default short clips may gain up to four images.
 */
export function selectAdaptiveVideoTimestamps(raw: Buffer, durationSeconds: number, frameCount?: number): number[] {
  const baseline = buildVideoSampleTimestamps(durationSeconds, frameCount);
  if (durationSeconds > MAX_VIDEO_DURATION_SECONDS) throw new Error("Video exceeds maximum duration");
  if (raw.length === 0 || raw.length % SCREENING_FRAME_BYTES !== 0 || raw.length > MAX_SCREENING_BYTES) {
    throw new Error("Invalid video screening output");
  }
  const count = raw.length / SCREENING_FRAME_BYTES;
  if (count > Math.ceil(durationSeconds * VIDEO_SCREENING_FPS) + 1) throw new Error("Excessive video screening output");
  if (baseline.length < 3 || count < 2) return baseline;
  const reference = [...new Set(baseline.map(time => Math.min(count - 1, Math.round(time * VIDEO_SCREENING_FPS))))];
  const changes: Array<{ index: number; strength: number }> = [];
  for (let index = 1; index < count; index++) {
    const strength = frameDifference(raw, index - 1, index);
    if (strength >= MIN_VISUAL_CHANGE) changes.push({ index, strength });
  }
  // A pair of transitions describes a short-lived interval. Select its middle, not the
  // frame after it disappears. Keeping only strongest boundaries before pairing would lose it.
  const intervals = changes.map((change, position) => {
    const end = changes[position + 1]?.index ?? count;
    const index = Math.min(end - 1, change.index + Math.floor((end - change.index) / 2));
    return { index, strength: change.strength };
  }).filter(candidate => candidate.index / VIDEO_SCREENING_FPS < durationSeconds)
    .sort((a, b) => b.strength - a.strength || a.index - b.index).slice(0, MAX_CHANGE_INTERVALS);
  const candidates = intervals.map(candidate => ({ ...candidate,
    // Dense FPS rounding and a later precise JPEG seek need not choose the same source
    // frame at a transition. Only call baseline coverage redundant when its neighbours
    // also represent the candidate; otherwise retain an exact dense-scan timestamp.
    novelty: Math.min(...reference.map(index => Math.max(...[-1, 0, 1].map(offset =>
      frameDifference(raw, candidate.index, Math.max(0, Math.min(count - 1, index + offset))))))),
  })).filter(candidate => candidate.novelty >= MIN_VISUAL_CHANGE)
    .sort((a, b) => b.novelty - a.novelty || a.index - b.index);
  const cap = frameCount ?? MAX_VIDEO_SAMPLE_FRAMES;
  const adaptive: typeof candidates = [];
  for (const candidate of candidates) {
    if (adaptive.length >= Math.min(MAX_ADAPTIVE_FRAMES, cap - 2)) break;
    if (adaptive.some(selected => Math.abs(selected.index - candidate.index) / VIDEO_SCREENING_FPS < Math.min(0.25, durationSeconds / 100)
      || frameDifference(raw, selected.index, candidate.index) < MIN_VISUAL_CHANGE)) continue;
    adaptive.push(candidate);
  }
  const target = Math.min(cap, baseline.length + adaptive.length);
  const selected = new Set<number>([baseline[0], baseline.at(-1)!]);
  for (const candidate of adaptive) selected.add(Number((candidate.index / VIDEO_SCREENING_FPS).toFixed(3)));
  // Keep the remaining uniform coverage as evenly spread as possible after adding novelty.
  while (selected.size < target) {
    const remaining = baseline.filter(time => !selected.has(time));
    if (!remaining.length) break;
    remaining.sort((a, b) => Math.min(...[...selected].map(time => Math.abs(time - b)))
      - Math.min(...[...selected].map(time => Math.abs(time - a))) || a - b);
    selected.add(remaining[0]);
  }
  return [...selected].sort((a, b) => a - b);
}

async function screenVideo(filePath: string, durationSeconds: number, signal: AbortSignal): Promise<Buffer> {
  const { stdout } = await execFileAsync("ffmpeg", [
    "-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-threads", "2", "-i", filePath,
    "-map", "0:v:0", "-an", "-sn", "-dn", "-t", String(durationSeconds),
    "-vf", `setpts=PTS-STARTPTS,fps=${VIDEO_SCREENING_FPS}:start_time=0:eof_action=pass,scale=${VIDEO_SCREENING_DIMENSION}:${VIDEO_SCREENING_DIMENSION}:force_original_aspect_ratio=decrease,pad=${VIDEO_SCREENING_DIMENSION}:${VIDEO_SCREENING_DIMENSION}:(ow-iw)/2:(oh-ih)/2,format=gray`,
    "-frames:v", String(MAX_SCREENING_FRAMES), "-threads", "1", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
  ], { signal, timeout: 12_000, encoding: "buffer", maxBuffer: MAX_SCREENING_BYTES + 4096, windowsHide: true });
  return stdout;
}

export function parseVideoProbe(raw: string): number {
  let data: { format?: { duration?: unknown }; streams?: Array<{ codec_type?: string; width?: number; height?: number }> };
  try { data = JSON.parse(raw); } catch { throw new Error("Invalid video metadata"); }
  const stream = data.streams?.[0];
  const duration = Number(data.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || stream?.codec_type !== "video"
    || !Number.isInteger(stream.width) || !Number.isInteger(stream.height)
    || stream.width! <= 0 || stream.height! <= 0
    || stream.width! > 8192 || stream.height! > 8192 || stream.width! * stream.height! > 33_554_432) {
    throw new Error("Unsupported or invalid video metadata");
  }
  return duration;
}

/** Safe for an early API check; the caller decides how to report duration > 180 s. */
export async function getVideoDurationSeconds(filePath: string, options: DeadlineOptions = {}): Promise<number> {
  return withDeadline(async (signal) => {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-protocol_whitelist", "file,pipe", "-select_streams", "v:0",
      "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", filePath,
    ], { signal, timeout: Math.min(options.timeoutMs ?? 10_000, 10_000), maxBuffer: 256 * 1024, windowsHide: true });
    return parseVideoProbe(stdout);
  }, options, "Video metadata probe", 10_000);
}

export async function extractVideoFrames(params: {
  filePath: string;
  frameCount?: number;
  durationSeconds?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<VideoFrame[]> {
  return withDeadline(async (signal) => {
    const duration = params.durationSeconds ?? await getVideoDurationSeconds(params.filePath, { signal });
    if (duration > MAX_VIDEO_DURATION_SECONDS) throw new Error("Video exceeds maximum duration");
    const baseline = buildVideoSampleTimestamps(duration, params.frameCount);
    const timestamps = duration < 0.25 || baseline.length < 3 ? baseline
      : selectAdaptiveVideoTimestamps(await screenVideo(params.filePath, duration, signal), duration, params.frameCount);
    const directory = await mkdtemp(join(tmpdir(), "scam-shield-video-"));
    try {
      const frames: VideoFrame[] = [];
      for (const [index, timestampSeconds] of timestamps.entries()) {
        signal.throwIfAborted();
        const outputPath = join(directory, `frame-${String(index + 1).padStart(2, "0")}.jpg`);
        await execFileAsync("ffmpeg", [
          "-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe",
          "-threads", "2", "-ss", String(timestampSeconds), "-i", params.filePath, "-frames:v", "1",
          "-vf", `scale=${MAX_FRAME_DIMENSION}:${MAX_FRAME_DIMENSION}:force_original_aspect_ratio=decrease`,
          "-pix_fmt", "yuvj420p", "-q:v", "4", "-threads", "1", "-y", outputPath,
        ], { signal, timeout: 10_000, maxBuffer: 256 * 1024, windowsHide: true });
        let bytes: Buffer;
        try { bytes = await readFile(outputPath); }
        catch (error) {
          // A sparse/held final frame can have no frame after an accurate seek.
          // Only skip the expected missing output after a successful ffmpeg run.
          if ((error as NodeJS.ErrnoException).code === "ENOENT" && timestampSeconds > 0) continue;
          throw error;
        }
        if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) throw new Error("Invalid extracted video frame");
        frames.push({ timestampSeconds, dataBase64: bytes.toString("base64"), mimeType: "image/jpeg" });
      }
      if (frames.length === 0) throw new Error("No decodable video frames");
      return frames;
    } finally {
      // This path is created by mkdtemp above; never derived from an upload filename.
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }, params, "Video frame extraction", 30_000);
}
