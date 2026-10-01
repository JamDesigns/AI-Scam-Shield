import type { Readable } from "node:stream";

export type MediaForensicsProviderMedia = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createReadStream: () => Readable;
};

export type MediaForensicsGeneratorScore = {
  name: string;
  score: number;
};

export type MediaForensicsObservation = {
  frameIndex?: number;
  timestampSeconds?: number;
  aiGeneratedScore?: number;
  notAiGeneratedScore?: number;
  deepfakeScore?: number;
  aiGeneratedAudioScore?: number;
  notAiGeneratedAudioScore?: number;
  generatorScores?: MediaForensicsGeneratorScore[];
};

export type MediaForensicsCompletedResult = {
  status: "completed";
  submissionId?: string;
  observations: MediaForensicsObservation[];
};

export type MediaForensicsProcessingResult = {
  status: "processing";
  submissionId: string;
};

export type MediaForensicsFailedResult = {
  status: "failed";
  submissionId?: string;
  error?: string;
};

export type MediaForensicsProviderResult =
  | MediaForensicsCompletedResult
  | MediaForensicsProcessingResult
  | MediaForensicsFailedResult;

export interface MediaForensicsProvider {
  readonly name: string;

  analyze(
    media: MediaForensicsProviderMedia,
  ): Promise<MediaForensicsProviderResult>;

  getResult?(
    submissionId: string,
  ): Promise<MediaForensicsProviderResult>;
}
