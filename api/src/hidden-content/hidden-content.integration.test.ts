import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectAppendedZip } from "./appended-zip.js";
import { extractVideoFrames } from "../video/video-frame-extractor.js";
import { analyzeMediaHiddenContent } from "./media-hidden-content.js";
const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
const containers = JSON.parse(readFileSync(fixture("container-manifest.json"), "utf8")) as Array<{
  id: string; file: string; recognized: boolean; encryptedEntries: number; text: string | null;
}>;
describe("independent container fixtures", () => {
  for (const row of containers) it(row.id, () => {
    const result = inspectAppendedZip(readFileSync(fixture(row.file)));
    expect(result.status === "recognized_appended_zip").toBe(row.recognized);
    expect(result.encryptedEntries).toBe(row.encryptedEntries);
    if (row.text) expect(result.texts.some(text => text.includes(row.text!))).toBe(true);
    else expect(result.texts).toEqual([]);
  });
});
const tools = ["ffprobe", "ffmpeg"].every(binary => spawnSync(binary, ["-version"], { windowsHide: true }).status === 0);
const media = JSON.parse(readFileSync(fixture("media-manifest.json"), "utf8")) as Array<{
  file: string; durationSeconds: number; text: string | null; source: string | null;
}>;
describe.skipIf(!tools)("real offline audio/video inspection", () => {
  for (const row of media) it(row.file, async () => {
    const result = await analyzeMediaHiddenContent({ filePath: fileURLToPath(fixture(row.file)), durationSeconds: row.durationSeconds });
    if (row.source === "encrypted") expect(result.encryptedEntriesDeclared).toBe(1);
    else if (row.text) expect(result.candidates.some(c => c.source === row.source && c.text.includes(row.text!))).toBe(true);
    else expect(result.candidates.filter(c => ["audio_pcm_lsb", "lossless_frame_lsb", "subtitle_track"].includes(c.source))).toEqual([]);
    expect(result.candidates.length).toBeLessThanOrEqual(6);
    expect(result.candidates.every(c => c.text.length <= 600)).toBe(true);
    if (row.file === "V06-lossy-control.mp4") expect(result.frameScan).toBe("unsupported_or_lossy_pixels");
  }, 12000);
  it("keeps sparse one-fps video analysable when late target frames do not exist", async () => {
    const frames = await extractVideoFrames({ filePath: fileURLToPath(fixture("V01-lossless-frame.mov")), durationSeconds: 4 });
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every(frame => frame.dataBase64.length > 0)).toBe(true);
  }, 12000);
  it("propagates caller cancellation instead of reporting a clean scan", async () => {
    const controller = new AbortController(); controller.abort(new Error("Owner cancelled"));
    await expect(analyzeMediaHiddenContent({ filePath: fileURLToPath(fixture("V01-lossless-frame.mov")), durationSeconds: 4,
      signal: controller.signal })).rejects.toThrow("Owner cancelled");
  });
});
