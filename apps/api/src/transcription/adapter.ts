// Whisper transcription behind an adapter (PRD-02 section 3, TECH-ARCHITECTURE
// section 3a: "transcription is not agentic at all" — a plain vendor call,
// not a schema-constrained agent run). Real Whisper in staging and
// production, a deterministic mock in tests.
export interface TranscriptionInput {
  audio: Buffer;
  contentType: string;
  /** A fixed language from Preferences overrides Whisper's own detection (S-5). */
  languageOverride?: string;
}

export interface TranscriptionResult {
  transcript: string;
  /** ISO 639-1. */
  language: string;
  /** 0..1; the mood-proposal threshold in step 1.2 reads this, not this step. */
  confidence: number;
  model: string;
  costUsd: number;
}

export interface TranscriptionAdapter {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}

export class TranscriptionFailedError extends Error {}
