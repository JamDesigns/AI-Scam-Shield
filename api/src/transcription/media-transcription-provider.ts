import type { Readable } from "node:stream";
import type { AiProviderUsage } from "../ai/ai-provider.js";

export type MediaTranscriptionProviderMedia = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createReadStream: () => Readable;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Trusted server tempfile/probe metadata, never accepted directly from the mobile payload. */
  filePath?: string;
  durationSeconds?: number;
  onUsage?: (usage: AiProviderUsage) => void;
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
  transcriptionStatus?: "no_speech" | "transcribed" | "unintelligible";
};

export interface MediaTranscriptionProvider {
  readonly name: string;

  transcribe(
    media: MediaTranscriptionProviderMedia,
  ): Promise<MediaTranscriptionResult>;
}
