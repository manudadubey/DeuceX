import type { FinancialActionModelClient } from './model-client';

export interface MockFinancialActionFixture {
  text: string;
  secondSentence: string | null;
}

const DEFAULT_FIXTURE: MockFinancialActionFixture = {
  text: "Update your balance so this week's runway is accurate.",
  secondSentence: null,
};

// Mirrors mindset-coach/mock-client.ts's shape: a fixed fixture for tests
// and apps/api's dev-only fallback when OPENAI_API_KEY is unset.
export function createMockFinancialActionClient(
  fixture: MockFinancialActionFixture = DEFAULT_FIXTURE,
): FinancialActionModelClient {
  return {
    async complete() {
      return { raw: { ...fixture }, usage: { inputTokens: 200, outputTokens: 20 } };
    },
  };
}

export function createInvalidFinancialActionClient(): FinancialActionModelClient {
  return {
    async complete() {
      return { raw: { text: '' }, usage: { inputTokens: 200, outputTokens: 5 } };
    },
  };
}
