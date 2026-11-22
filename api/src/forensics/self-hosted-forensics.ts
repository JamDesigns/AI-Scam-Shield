import { createLocalForensicsAnalyzer } from "../local-forensics.js";
import type { MediaForensicsEvidence } from "./media-forensics-evidence.js";

/** A separately configured, private sidecar; never a silent substitute for Hive. */
export function createSelfHostedForensicsAnalyzer(baseUrl: string) {
  // Render private services use single-label internal DNS names. Public domains,
  // public IPs and credentials remain rejected by the existing endpoint guard.
  const url = new URL(baseUrl);
  const trustedServiceHost = url.protocol === "http:" && url.port === "8081"
    && /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(url.hostname)
    ? url.hostname : undefined;
  const analyzer = createLocalForensicsAnalyzer({ baseUrl, trustedServiceHost });
  return {
    name: "self-hosted-experimental" as const,
    async analyze(input: Parameters<typeof analyzer.analyze>[0]): Promise<MediaForensicsEvidence> {
      const evidence = await analyzer.analyze(input);
      return { ...evidence, provider: "self-hosted-experimental" };
    },
  };
}
