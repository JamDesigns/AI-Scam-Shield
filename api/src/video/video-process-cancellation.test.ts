import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ run: vi.fn(), cleanup: vi.fn() }));
vi.mock("node:child_process", () => {
  const execFile = Object.assign(() => undefined, { [Symbol.for("nodejs.util.promisify.custom")]: state.run });
  return { execFile };
});
vi.mock("node:fs/promises", () => ({
  mkdtemp: async () => "C:/fixture/scam-shield-video-owned",
  readFile: async () => Buffer.from("jpeg"),
  rm: state.cleanup,
}));
import { extractVideoFrames, getVideoDurationSeconds } from "./video-frame-extractor.js";

describe("video subprocess cancellation", () => {
  beforeEach(() => { vi.useFakeTimers(); state.run.mockReset(); state.cleanup.mockReset(); });
  afterEach(() => vi.useRealTimers());
  it("passes the deadline signal to ffprobe and aborts it", async () => {
    let processSignal: AbortSignal | undefined;
    state.run.mockImplementation((_tool, _args, options) => new Promise((_resolve, reject) => {
      processSignal = options.signal;
      processSignal?.addEventListener("abort", () => reject(processSignal?.reason), { once: true });
    }));
    const result = getVideoDurationSeconds("fixture.mp4", { timeoutMs: 20 });
    const assertion = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(25); await assertion;
    expect(processSignal?.aborted).toBe(true);
    expect(state.run.mock.calls[0][1]).toContain("file,pipe");
    expect(state.run.mock.calls[0][2].windowsHide).toBe(true);
  });
  it("aborts ffmpeg, keeps processing offline and cleans its owned temporary directory", async () => {
    let processSignal: AbortSignal | undefined;
    state.run.mockResolvedValueOnce({ stdout: Buffer.alloc(160 * 160 * 16) });
    state.run.mockImplementation((_tool, _args, options) => new Promise((_resolve, reject) => {
      processSignal = options.signal;
      processSignal?.addEventListener("abort", () => reject(processSignal?.reason), { once: true });
    }));
    const result = extractVideoFrames({ filePath: "fixture.mp4", durationSeconds: 2, timeoutMs: 20 });
    const assertion = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(25); await assertion;
    expect(processSignal?.aborted).toBe(true);
    expect(state.run.mock.calls[0][0]).toBe("ffmpeg");
    expect(state.run.mock.calls[0][1]).toContain("file,pipe");
    expect(state.run).toHaveBeenCalledTimes(2);
    expect(state.run.mock.calls[1][1]).toContain("file,pipe");
    expect(state.cleanup).toHaveBeenCalledWith("C:/fixture/scam-shield-video-owned", expect.objectContaining({ recursive: true, force: true }));
  });
  it("aborts dense screening before a temporary directory is needed", async () => {
    let processSignal: AbortSignal | undefined;
    state.run.mockImplementation((_tool, _args, options) => new Promise((_resolve, reject) => {
      processSignal = options.signal;
      processSignal?.addEventListener("abort", () => reject(processSignal?.reason), { once: true });
    }));
    const assertion = expect(extractVideoFrames({ filePath: "fixture.mp4", durationSeconds: 2, timeoutMs: 20 })).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(25); await assertion;
    expect(processSignal?.aborted).toBe(true);
    expect(state.run).toHaveBeenCalledTimes(1);
    expect(state.cleanup).not.toHaveBeenCalled();
  });
});
