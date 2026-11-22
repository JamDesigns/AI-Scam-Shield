import { describe, expect, it } from "vitest";
import { analysisProfileSchema } from "./analysis-profile.js";

const local = {
  ANALYSIS_PROFILE: "local",
  LOCAL_AI_BASE_URL: "http://host.docker.internal:8080/v1",
  LOCAL_AI_MODEL: "gemma-4-E4B-it",
};

describe("analysis profiles", () => {
  it("preserves existing provider configuration when no profile is supplied", () => {
    expect(analysisProfileSchema.parse({ NODE_ENV: "development" })).toEqual({ mode: "production" });
  });

  it("requires a complete and explicit local configuration", () => {
    expect(analysisProfileSchema.parse(local)).toEqual({ mode: "local", baseUrl: local.LOCAL_AI_BASE_URL, model: local.LOCAL_AI_MODEL });
    expect(analysisProfileSchema.safeParse({ ...local, LOCAL_AI_BASE_URL: undefined }).success).toBe(false);
    expect(analysisProfileSchema.safeParse({ ...local, LOCAL_AI_MODEL: " " }).success).toBe(false);
    expect(analysisProfileSchema.safeParse({ ...local, NODE_ENV: "production" }).success).toBe(false);
  });
});
