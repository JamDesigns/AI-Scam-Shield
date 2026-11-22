import { createLocalForensicsAnalyzer } from "../local-forensics.js";
import type { MediaForensicsEvidence } from "./media-forensics-evidence.js";

/** A separately configured, private sidecar; never a silent substitute for Hive. */
export function createSelfHostedForensicsAnalyzer(baseUrl: string) {
  // Reuse the reviewed loopback/trusted-Docker origin validation and bounded protocol.
  // This client intentionally cannot expose the unauthenticated development sidecar publicly.
  const analyzer = createLocalForensicsAnalyzer({ baseUrl });
  return {
    name: "self-hosted-experimental" as const,
    async analyze(input: Parameters<typeof analyzer.analyze>[0]): Promise<MediaForensicsEvidence> {
      const evidence = await analyzer.analyze(input);
      return { ...evidence, provider: "self-hosted-experimental" };
    },
  };
}
