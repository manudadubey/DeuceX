import { describe, expect, it } from 'vitest';
import { calculateCost } from './pricing';

describe('calculateCost', () => {
  it('combines input and output token cost for a known model', () => {
    const cost = calculateCost('claude-sonnet-5', {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    });
    // 1M input @ $3/M + 0.5M output @ $15/M = $3 + $7.50 = $10.50
    expect(cost).toEqual({ amount: 10.5, currency: 'USD' });
  });

  it('returns null for a model with no pricing entry, rather than guessing', () => {
    expect(calculateCost('some-future-model', { inputTokens: 100, outputTokens: 100 })).toBeNull();
  });

  it('returns zero cost for zero usage', () => {
    expect(calculateCost('claude-haiku-4-5-20251001', { inputTokens: 0, outputTokens: 0 })).toEqual(
      { amount: 0, currency: 'USD' },
    );
  });
});
