import type { InsightModelClient } from './model-client';

export interface MockInsightFixture {
  body: string[];
  focus: string | null;
}

const DEFAULT_FIXTURE: MockInsightFixture = {
  body: [
    'Three of your last four notes after a tiebreak loss mention rushing the second serve.',
    "Today's practice is a good place to slow that toss down before it matters again.",
  ],
  focus: 'Hit ten deliberately slow second serves before you do anything else today.',
};

// Mirrors match-scribe/mock-client.ts's shape: a fixed fixture for tests and
// apps/api's dev-only fallback when OPENAI_API_KEY is unset.
export function createMockInsightClient(
  fixture: MockInsightFixture = DEFAULT_FIXTURE,
): InsightModelClient {
  return {
    async complete() {
      return { raw: { ...fixture }, usage: { inputTokens: 500, outputTokens: 60 } };
    },
  };
}

export function createInvalidInsightClient(): InsightModelClient {
  return {
    async complete() {
      return { raw: { body: [] }, usage: { inputTokens: 500, outputTokens: 10 } };
    },
  };
}

// AC-11: a response that always trips the tone-check blocklist, for testing
// the regenerate-once-then-withhold path independently from the schema
// corrective retry.
export function createClinicalLanguageInsightClient(): InsightModelClient {
  return {
    async complete() {
      return {
        raw: {
          body: ['This reads like a symptom of burnout building across the last few weeks.'],
          focus: 'Talk to someone about the diagnosis before your next match.',
        },
        usage: { inputTokens: 500, outputTokens: 40 },
      };
    },
  };
}
