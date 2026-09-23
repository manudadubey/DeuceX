import { AgentValidationError } from '@procircuit/actions';
import { describe, expect, it } from 'vitest';
import type { ActionCandidate } from './action-candidates';
import { generateFinancialAction } from './generate-action';
import { createInvalidFinancialActionClient, createMockFinancialActionClient } from './mock-client';
import type { FinancialActionModelClient } from './model-client';

const CANDIDATE: ActionCandidate = {
  key: 'chase_overdue_receivable',
  effectWeeks: 0.78,
  hoursEffort: 0.25,
  score: 3.12,
  facts: {
    key: 'chase_overdue_receivable',
    label: 'Genoa Q2',
    daysOverdue: 7,
    amountHomeEstimate: 890,
  },
};

function sequenceClient(...responses: Array<{ raw: unknown }>): FinancialActionModelClient {
  let call = 0;
  return {
    async complete() {
      const response = responses[Math.min(call, responses.length - 1)]!;
      call += 1;
      return { raw: response.raw, usage: { inputTokens: 200, outputTokens: 20 } };
    },
  };
}

describe('generateFinancialAction', () => {
  it('phrases the deterministically-chosen candidate (F-18: exactly one action)', async () => {
    const client = createMockFinancialActionClient();

    const result = await generateFinancialAction(client, CANDIDATE);

    expect(result.candidateKey).toBe('chase_overdue_receivable');
    expect(result.effectWeeks).toBe(0.78);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('retries once with the validation error appended, then succeeds', async () => {
    const client = sequenceClient(
      { raw: { text: '' } }, // fails min length
      { raw: { text: 'Chase the Genoa Q2 cheque.', secondSentence: null } },
    );

    const result = await generateFinancialAction(client, CANDIDATE);

    expect(result.text).toBe('Chase the Genoa Q2 cheque.');
    expect(result.usage).toEqual({ inputTokens: 400, outputTokens: 40 });
  });

  it('fails cleanly with AgentValidationError after a second invalid response', async () => {
    const client = createInvalidFinancialActionClient();

    await expect(generateFinancialAction(client, CANDIDATE)).rejects.toThrow(AgentValidationError);
  });
});
