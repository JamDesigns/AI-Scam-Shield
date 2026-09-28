import { describe, expect, it } from "vitest";
import { buildVideoSampleTimestamps } from "./video-frame-extractor.js";

describe("buildVideoSampleTimestamps", () => {
  it("distributes frames evenly across the video duration", () => {
    expect(buildVideoSampleTimestamps(60, 6)).toEqual([
      5,
      15,
      25,
      35,
      45,
      55,
    ]);
  });

  it("uses the default frame count", () => {
    expect(buildVideoSampleTimestamps(12)).toEqual([
      1,
      3,
      5,
      7,
      9,
      11,
    ]);
  });

  it("supports short videos without sampling the exact boundaries", () => {
    expect(buildVideoSampleTimestamps(3, 3)).toEqual([
      0.5,
      1.5,
      2.5,
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
});
