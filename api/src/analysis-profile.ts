import { z } from "zod";

export const analysisProfileSchema = z.object({
  ANALYSIS_PROFILE: z.enum(["local", "production"]).default("production"),
  LOCAL_AI_BASE_URL: z.string().optional(),
  LOCAL_AI_MODEL: z.string().optional(),
  LOCAL_FORENSICS_BASE_URL: z.string().optional(),
  NODE_ENV: z.string().optional(),
}).transform((env, context) => {
  if (env.ANALYSIS_PROFILE === "production") return { mode: "production" } as const;

  const baseUrl = env.LOCAL_AI_BASE_URL?.trim();
  const model = env.LOCAL_AI_MODEL?.trim();
  if (env.NODE_ENV === "production" || !baseUrl || !model) {
    context.addIssue({ code: "custom", message: "Local analysis requires a non-production runtime, LOCAL_AI_BASE_URL and LOCAL_AI_MODEL" });
    return z.NEVER;
  }
  return { mode: "local", baseUrl, model, ...(env.LOCAL_FORENSICS_BASE_URL?.trim()
    ? { forensicsBaseUrl: env.LOCAL_FORENSICS_BASE_URL.trim() } : {}) } as const;
});
