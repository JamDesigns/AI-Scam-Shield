import { describe, expect, it } from "vitest";

import { createMediaForensicsProvider } from "./media-forensics-provider-factory.js";

describe("createMediaForensicsProvider", () => {
  it("creates a Hive provider when model and API key are configured", () => {
    const provider = createMediaForensicsProvider({
      provider: "hive",
      model: "hive/ai-generated-and-deepfake-content-detection",
      apiKey: "hive-test-key",
    });

    expect(provider).not.toBeNull();
    expect(provider?.name).toBe("hive");
  });

  it("does not create a Hive provider without an API key", () => {
    const provider = createMediaForensicsProvider({
      provider: "hive",
      model: "hive/ai-generated-and-deepfake-content-detection",
    });

    expect(provider).toBeNull();
  });

  it("does not create a Hive provider without a model", () => {
    const provider = createMediaForensicsProvider({
      provider: "hive",
      model: "",
      apiKey: "hive-test-key",
    });

    expect(provider).toBeNull();
  });

  it("rejects unsupported providers", () => {
    expect(() =>
      createMediaForensicsProvider({
        provider: "unknown",
        model: "test-model",
        apiKey: "test-key",
      }),
    ).toThrow(
      'Unsupported media forensics provider "unknown"',
    );
  });
});
