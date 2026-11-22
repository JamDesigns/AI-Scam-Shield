import { describe, expect, it } from "vitest";
import { buildVideoSampleTimestamps, parseVideoProbe, selectAdaptiveVideoTimestamps,
  VIDEO_SCREENING_DIMENSION, VIDEO_SCREENING_FPS } from "./video-frame-extractor.js";

describe("buildVideoSampleTimestamps", () => {
  it("covers the first frame and a decodable near-end frame", () => {
    expect(buildVideoSampleTimestamps(60, 6)).toEqual([
      0, 11.98, 23.96, 35.94, 47.92, 59.9,
    ]);
  });

  it("uses the default frame count", () => {
    expect(buildVideoSampleTimestamps(12)).toEqual([
      0, 2.38, 4.76, 7.14, 9.52, 11.9,
    ]);
  });

  it("supports short videos without seeking beyond their last decodable frame", () => {
    expect(buildVideoSampleTimestamps(3, 3)).toEqual([
      0, 1.45, 2.9,
    ]);
  });

  it("rejects invalid durations", () => {
    expect(() => buildVideoSampleTimestamps(0)).toThrow(
      "Video duration must be a positive finite number",
    );

    expect(() => buildVideoSampleTimestamps(Number.NaN)).toThrow(
      "Video duration must be a positive finite number",
    );
  });

  it("rejects invalid frame counts", () => {
    expect(() => buildVideoSampleTimestamps(10, 0)).toThrow(
      "Frame count must be a positive integer",
    );

    expect(() => buildVideoSampleTimestamps(10, 2.5)).toThrow(
      "Frame count must be a positive integer",
    );
  });

  it("increases sampling with duration within the fourteen-frame budget", () => {
    const short = buildVideoSampleTimestamps(12), long = buildVideoSampleTimestamps(180);
    expect(long.length).toBe(14);
    expect(long.length).toBeGreaterThan(short.length);
    expect(long[0]).toBe(0);
    expect(long.at(-1)).toBe(179.9);
    expect(new Set(long).size).toBe(long.length);
    expect(() => buildVideoSampleTimestamps(180, 15)).toThrow("no greater than 14");
  });

  it("does not generate duplicate timestamps or out-of-range seeks for subsecond video", () => {
    const timestamps = buildVideoSampleTimestamps(0.01);
    expect(timestamps.every((value) => value >= 0 && value < 0.01)).toBe(true);
    expect(new Set(timestamps).size).toBe(timestamps.length);
  });
});

describe("video metadata admission", () => {
  const valid = { format: { duration: "180.1" }, streams: [{ codec_type: "video", width: 1080, height: 1920 }] };
  it("returns duration so the API can report its product limit before providers", () => {
    expect(parseVideoProbe(JSON.stringify(valid))).toBe(180.1);
  });
  it.each(["not-json", "{}", JSON.stringify({ ...valid, streams: [] }), JSON.stringify({ ...valid, streams: [{ codec_type: "audio" }] }), JSON.stringify({ ...valid, format: { duration: "NaN" } }), JSON.stringify({ ...valid, streams: [{ codec_type: "video", width: 20000, height: 20000 }] })])("rejects malformed, non-video or excessive metadata %#", (input) => {
    expect(() => parseVideoProbe(input)).toThrow();
  });
});

const pixels = VIDEO_SCREENING_DIMENSION ** 2;
function sequence(seconds: number, events: Array<{ start: number; end: number; value: number }> = []): Buffer {
  const raw = Buffer.alloc(Math.ceil(seconds * VIDEO_SCREENING_FPS) * pixels, 40);
  for (const event of events) {
    for (let frame = Math.ceil(event.start * VIDEO_SCREENING_FPS); frame < Math.ceil(event.end * VIDEO_SCREENING_FPS); frame++) {
      raw.fill(event.value, frame * pixels, (frame + 1) * pixels);
    }
  }
  return raw;
}

describe("bounded adaptive visual coverage", () => {
  it.each([[0.75, 1], [2.375, 2.625], [8.125, 8.5]])("includes a brief changed interval %s–%s instead of only its disappearance", (start, end) => {
    const raw = sequence(20, [{ start, end, value: 180 }]);
    const timestamps = selectAdaptiveVideoTimestamps(raw, 20);
    expect(timestamps.some(time => time >= start && time < end)).toBe(true);
    expect(timestamps).toEqual(expect.arrayContaining(buildVideoSampleTimestamps(20)));
    expect(timestamps[0]).toBe(0);
    expect(timestamps.at(-1)).toBe(19.9);
    expect(timestamps.length).toBeLessThanOrEqual(14);
  });

  it("keeps static and small codec-noise controls on their original timeline", () => {
    const raw = sequence(20);
    raw.fill(41, 8 * pixels, 8 * pixels + 1000);
    expect(selectAdaptiveVideoTimestamps(raw, 20)).toEqual(buildVideoSampleTimestamps(20));
  });

  it("does not assume a rounded dense reference is covered by a uniform seek just before a flash", () => {
    const timestamps = selectAdaptiveVideoTimestamps(sequence(20, [{ start: 4, end: 4.125, value: 180 }]), 20);
    expect(timestamps).toContain(4);
    expect(timestamps).toContain(3.98);
  });

  it("does not add redundant pictures of a persistent scene already represented by baseline samples", () => {
    const raw = sequence(20, [{ start: 8, end: 20, value: 180 }]);
    expect(selectAdaptiveVideoTimestamps(raw, 20)).toEqual(buildVideoSampleTimestamps(20));
  });

  it("respects an explicit cap while retaining both ends and a transient", () => {
    const timestamps = selectAdaptiveVideoTimestamps(sequence(20, [{ start: .75, end: 1, value: 180 }]), 20, 3);
    expect(timestamps).toHaveLength(3);
    expect(timestamps[0]).toBe(0);
    expect(timestamps.at(-1)).toBe(19.9);
    expect(timestamps.some(time => time >= .75 && time < 1)).toBe(true);
  });

  it("bounds high-motion screening at the full 180-second admission limit", () => {
    const raw = sequence(180);
    for (let frame = 0; frame < 180 * VIDEO_SCREENING_FPS; frame++) raw.fill((frame * 47) % 256, frame * pixels, (frame + 1) * pixels);
    const timestamps = selectAdaptiveVideoTimestamps(raw, 180);
    expect(timestamps).toHaveLength(14);
    expect(timestamps[0]).toBe(0);
    expect(timestamps.at(-1)).toBe(179.9);
    expect(new Set(timestamps).size).toBe(timestamps.length);
    expect(timestamps.every(time => time >= 0 && time < 180)).toBe(true);
  });

  it("rejects malformed, excessive and over-duration screening buffers", () => {
    for (const raw of [Buffer.alloc(0), Buffer.alloc(pixels - 1), Buffer.alloc(100 * pixels)]) {
      expect(() => selectAdaptiveVideoTimestamps(raw, 1)).toThrow();
    }
    expect(() => selectAdaptiveVideoTimestamps(sequence(1), 180.1)).toThrow("maximum duration");
  });
});
