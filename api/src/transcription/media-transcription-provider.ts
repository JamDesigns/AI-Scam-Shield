import type { Readable } from "node:stream";

export type MediaTranscriptionProviderMedia = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createReadStream: () => Readable;
};

export type MediaTranscriptionWord = {
  text: string;
  startSeconds: number;
  endSeconds: number;
  confidence?: number;
  language?: string;
};

export type MediaTranscriptionResult = {
  requestId?: string;
  transcript: string;
  confidence?: number;
  languages: string[];
  words: MediaTranscriptionWord[];
};

export interface MediaTranscriptionProvider {
  readonly name: string;

  transcribe(
    media: MediaTranscriptionProviderMedia,
  ): Promise<MediaTranscriptionResult>;
}
