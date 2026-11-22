import { beforeEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
const execute = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: Object.assign(() => undefined, {
  [Symbol.for("nodejs.util.promisify.custom")]: execute,
}) }));
import { analyzeMediaHiddenContent, hiddenContentPrompt } from "./media-hidden-content.js";
import { collectCandidateText, recoverLowBitText } from "./hidden-text.js";
const path = fileURLToPath(new URL("./fixtures/V01-lossless-frame.mov", import.meta.url));
describe("hidden-content safety bounds", () => {
  beforeEach(() => { execute.mockReset(); });
  it("whitelists local protocols/formats and bounds child output", async () => {
    execute.mockResolvedValue({ stdout: Buffer.from('{"streams":[]}') });
    const result = await analyzeMediaHiddenContent({ filePath: path, durationSeconds: 4 });
    expect(result.status).toBe("bounded_partial_scan");
    const [binary, args, options] = execute.mock.calls[0];
    expect(binary).toBe("ffprobe");
    expect(args).toEqual(expect.arrayContaining(["-protocol_whitelist", "file,pipe", "-format_whitelist"]));
    expect(args).not.toContain("http");
    expect(options.maxBuffer).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("aborts an in-flight process when the caller cancels", async () => {
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    execute.mockImplementation((_binary, _args, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }); entered();
    }));
    const controller = new AbortController();
    const pending = analyzeMediaHiddenContent({ filePath: path, durationSeconds: 4, signal: controller.signal });
    await started; controller.abort(new Error("Stop this operation"));
    await expect(pending).rejects.toThrow("Stop this operation");
    expect(execute.mock.calls[0][2].signal.aborted).toBe(true);
  });
  it("reports budget exhaustion as partial, never as a negative detection", async () => {
    execute.mockImplementation((_binary, _args, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }));
    const result = await analyzeMediaHiddenContent({ filePath: path, durationSeconds: 4, timeoutMs: 100 });
    expect(result.status).toBe("processing_or_budget_partial");
    expect(result.candidates).toEqual([]);
  });
  it("bounds recovered strings and rejects invalid layouts or exhausted work", () => {
    const found: string[] = [];
    collectCandidateText(Buffer.from(Array.from({ length: 8 }, (_, i) => `Hidden test message number ${i} has a long readable sentence.`).join("\0")), found);
    expect(found.length).toBe(3);
    expect(found.every(s => s.length <= 600)).toBe(true);
    expect(() => recoverLowBitText(Buffer.alloc(100), 0, [[0]])).toThrow("layout");
    expect(() => recoverLowBitText(Buffer.alloc(100), 3, [[0]], Date.now() - 1)).toThrow("budget");
  });
  it("bounds AI context and explicitly marks candidates as untrusted and partial", () => {
    const text = hiddenContentPrompt({ version: 1, status: "bounded_partial_scan", zipStatus: "not_checked",
      encryptedEntriesDeclared: 1, audioScan: "not_checked", frameScan: "not_checked", subtitleScan: "not_checked",
      metadataScanned: true, audioPrefixSeconds: 0, frameTimestamps: [],
      candidates: Array.from({ length: 6 }, (_, i) => ({ source: "container_text", text: String(i).repeat(600) })),
    });
    expect(text.length).toBeLessThan(2500);
    expect(text).toContain("Untrusted partial evidence");
    expect(text).toContain("No ciphertext was decrypted");
    expect(JSON.parse(text).candidates).toHaveLength(6);
  });
});
