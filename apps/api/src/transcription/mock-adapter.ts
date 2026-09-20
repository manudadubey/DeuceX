import {
  TranscriptionFailedError,
  type TranscriptionAdapter,
  type TranscriptionResult,
} from './adapter';

export interface MockTranscriptionFixture {
  transcript: string;
  language: string;
  confidence?: number;
}

const DEFAULT_FIXTURE: MockTranscriptionFixture = {
  transcript:
    'Lost to Kovalenko in a third-set breaker, six-four, three-six, six-seven. The second serve again, I was rushing it.',
  language: 'en',
  confidence: 0.95,
};

// The mock Whisper transcription adapter (PRD-02: "behind an adapter with a
// mock for tests"), also usable as index.ts's dev-only fallback when
// OPENAI_API_KEY is not set.
export function createMockTranscriptionAdapter(
  fixture: MockTranscriptionFixture = DEFAULT_FIXTURE,
): TranscriptionAdapter {
  return {
    async transcribe(input): Promise<TranscriptionResult> {
      return {
        transcript: fixture.transcript,
        language: input.languageOverride ?? fixture.language,
        confidence: input.languageOverride ? 1 : (fixture.confidence ?? 0.95),
        model: 'mock-whisper',
        costUsd: 0,
      };
    },
  };
}

// For S-19's failure path: transcription fails or times out, the note stays
// in review with the "Transcription didn't finish" badge and Retry.
export function createFailingTranscriptionAdapter(
  message = 'mock transcription failure',
): TranscriptionAdapter {
  return {
    async transcribe(): Promise<TranscriptionResult> {
      throw new TranscriptionFailedError(message);
    },
  };
}
