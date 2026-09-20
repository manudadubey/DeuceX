import type { ExtractionModelClient } from './model-client';

// Mirrors apps/api/src/transcription/mock-adapter.ts's default fixture: the
// same "Lost to Kovalenko..." transcript that adapter returns by default, so
// the two mocks compose end to end in dev without real vendor credentials.
export interface MockExtractionFixture {
  ctx: 'match' | 'practice' | 'travel' | 'other';
  result: string | null;
  opponent: string | null;
  round: string | null;
  surface: string | null;
  tags: string[];
  mood: 'frustrated' | 'flat' | 'confident' | 'energised';
  moodConfidence: number;
  summary: string;
}

const DEFAULT_FIXTURE: MockExtractionFixture = {
  ctx: 'match',
  result: 'L 6-4 3-6 6-7(5)',
  opponent: 'Kovalenko',
  round: null,
  surface: null,
  tags: ['Second serve', 'Tiebreak'],
  mood: 'frustrated',
  moodConfidence: 0.8,
  summary: 'Lost a tight three-setter to Kovalenko, rushed the second serve under pressure.',
};

// The mock extraction model client (PRD-02, build plan step 1.2: "a
// transcript fixture produces a valid extraction in tests with a recorded
// mock response"), also usable as apps/api's dev-only fallback when
// ANTHROPIC_API_KEY is not set.
export function createMockExtractionClient(
  fixture: MockExtractionFixture = DEFAULT_FIXTURE,
): ExtractionModelClient {
  return {
    async complete() {
      return {
        raw: { ...fixture },
        usage: { inputTokens: 400, outputTokens: 120 },
      };
    },
  };
}

// For testing/demonstrating the failed_validation path: every response is
// missing required fields, so schema.ts's validation fails on both the
// first attempt and the corrective retry.
export function createInvalidExtractionClient(): ExtractionModelClient {
  return {
    async complete() {
      return {
        raw: { ctx: 'match' },
        usage: { inputTokens: 400, outputTokens: 40 },
      };
    },
  };
}
