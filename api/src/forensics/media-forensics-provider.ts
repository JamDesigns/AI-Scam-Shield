import type { Readable } from "node:stream";

export type MediaForensicsInput = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createReadStream: () => Readable;
};

export type MediaForensicsSignal = {
  name: string;
  verdict: "authentic" | "suspicious" | "inconclusive";
  confidence?: number;
};

export type MediaForensicsCompletedResult = {
  verdict: "authentic" | "suspicious" | "inconclusive";
  confidence?: number;
  signals: MediaForensicsSignal[];
};

export type MediaForensicsPollResult =
  | {
      status: "processing";
    }
  | {
      status: "completed";
      result: MediaForensicsCompletedResult;
    }
  | {
      status: "failed";
      error?: string;
    };

export type MediaForensicsSubmission = {
  submissionId: string;
};

export interface MediaForensicsProvider {
  readonly name: string;

  submit(
    media: MediaForensicsInput,
  ): Promise<MediaForensicsSubmission>;

  getResult(
    submissionId: string,
  ): Promise<MediaForensicsPollResult>;
}
