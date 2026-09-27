import type {
  MediaForensicsCompletedResult,
  MediaForensicsObservation,
} from "./media-forensics-provider.js";

const HIVE_AI_GENERATED_THRESHOLD = 0.9;
const HIVE_DEEPFAKE_IMAGE_THRESHOLD = 0.9;
const HIVE_DEEPFAKE_VIDEO_THRESHOLD = 0.5;
const HIVE_DEEPFAKE_VIDEO_FRAME_SHARE = 0.05;

export type MediaForensicsTopGenerator = {
  name: string;
  score: number;
};

export type MediaForensicsEvidence = {
  provider: string;
  aiGeneratedDetected: boolean;
  deepfakeDetected: boolean;
  maxAiGeneratedScore: number | null;
  maxDeepfakeScore: number | null;
  maxAiGeneratedAudioScore: number | null;
  topGenerator: MediaForensicsTopGenerator | null;
  suspiciousTimestamps: number[];
};

export type BuildMediaForensicsEvidenceParams = {
  provider: string;
  mimeType: string;
  result: MediaForensicsCompletedResult;
};

export function buildMediaForensicsEvidence(
  params: BuildMediaForensicsEvidenceParams,
): MediaForensicsEvidence {
  const provider = params.provider.trim().toLowerCase();

  if (provider !== "hive") {
    throw new Error(
      `Unsupported media forensics evidence provider "${params.provider}"`,
    );
  }

  return buildHiveEvidence(params.mimeType, params.result.observations);
}

function buildHiveEvidence(
  mimeType: string,
  observations: MediaForensicsObservation[],
): MediaForensicsEvidence {
  const isImage = mimeType.toLowerCase().startsWith("image/");
  const isVideo = mimeType.toLowerCase().startsWith("video/");

  const maxAiGeneratedScore = maxDefined(
    observations.map((item) => item.aiGeneratedScore),
  );

  const maxDeepfakeScore = maxDefined(
    observations.map((item) => item.deepfakeScore),
  );

  const maxAiGeneratedAudioScore = maxDefined(
    observations.map((item) => item.aiGeneratedAudioScore),
  );

  const aiGeneratedDetected =
    (isImage || isVideo) &&
    observations.some(
      (item) =>
        typeof item.aiGeneratedScore === "number" &&
        item.aiGeneratedScore >= HIVE_AI_GENERATED_THRESHOLD,
    );

  const deepfakeDetected = isImage
    ? observations.some(
        (item) =>
          typeof item.deepfakeScore === "number" &&
          item.deepfakeScore >= HIVE_DEEPFAKE_IMAGE_THRESHOLD,
      )
    : isVideo
      ? hasHiveVideoDeepfake(observations)
      : false;

  const suspiciousTimestamps = Array.from(
    new Set(
      observations
        .filter((item) => {
          const aiGenerated =
            typeof item.aiGeneratedScore === "number" &&
            item.aiGeneratedScore >= HIVE_AI_GENERATED_THRESHOLD;

          const deepfake =
            isImage
              ? typeof item.deepfakeScore === "number" &&
                item.deepfakeScore >= HIVE_DEEPFAKE_IMAGE_THRESHOLD
              : isVideo &&
                typeof item.deepfakeScore === "number" &&
                item.deepfakeScore >= HIVE_DEEPFAKE_VIDEO_THRESHOLD;

          return aiGenerated || deepfake;
        })
        .map((item) => item.timestampSeconds)
        .filter(
          (value): value is number =>
            typeof value === "number",
        ),
    ),
  ).sort((left, right) => left - right);

  return {
    provider: "hive",
    aiGeneratedDetected,
    deepfakeDetected,
    maxAiGeneratedScore,
    maxDeepfakeScore,
    maxAiGeneratedAudioScore,
    topGenerator: aiGeneratedDetected
      ? getTopGenerator(observations)
      : null,
    suspiciousTimestamps,
  };
}

function hasHiveVideoDeepfake(
  observations: MediaForensicsObservation[],
): boolean {
  if (observations.length === 0) {
    return false;
  }

  const ordered = [...observations].sort(compareObservations);

  let qualifyingFrames = 0;

  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];

    if (
      typeof current.deepfakeScore !== "number" ||
      current.deepfakeScore < HIVE_DEEPFAKE_VIDEO_THRESHOLD
    ) {
      continue;
    }

    qualifyingFrames += 1;

    if (index === 0) {
      continue;
    }

    const previous = ordered[index - 1];

    if (
      typeof previous.deepfakeScore === "number" &&
      previous.deepfakeScore >= HIVE_DEEPFAKE_VIDEO_THRESHOLD &&
      areConsecutive(previous, current)
    ) {
      return true;
    }
  }

  return (
    qualifyingFrames / observations.length >=
    HIVE_DEEPFAKE_VIDEO_FRAME_SHARE
  );
}

function areConsecutive(
  previous: MediaForensicsObservation,
  current: MediaForensicsObservation,
): boolean {
  if (
    typeof previous.frameIndex === "number" &&
    typeof current.frameIndex === "number"
  ) {
    return current.frameIndex === previous.frameIndex + 1;
  }

  return true;
}

function compareObservations(
  left: MediaForensicsObservation,
  right: MediaForensicsObservation,
): number {
  if (
    typeof left.frameIndex === "number" &&
    typeof right.frameIndex === "number"
  ) {
    return left.frameIndex - right.frameIndex;
  }

  if (
    typeof left.timestampSeconds === "number" &&
    typeof right.timestampSeconds === "number"
  ) {
    return left.timestampSeconds - right.timestampSeconds;
  }

  return 0;
}

function maxDefined(
  values: Array<number | undefined>,
): number | null {
  const defined = values.filter(
    (value): value is number => typeof value === "number",
  );

  return defined.length > 0 ? Math.max(...defined) : null;
}

function getTopGenerator(
  observations: MediaForensicsObservation[],
): MediaForensicsTopGenerator | null {
  let top: MediaForensicsTopGenerator | null = null;

  for (const observation of observations) {
    for (const generator of observation.generatorScores ?? []) {
      if (!top || generator.score > top.score) {
        top = {
          name: generator.name,
          score: generator.score,
        };
      }
    }
  }

  return top;
}
