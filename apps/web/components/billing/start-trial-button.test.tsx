import { describe, expect, it } from 'vitest';
import { trialConsequence } from './start-trial-button';

describe('trialConsequence', () => {
  const now = new Date('2026-09-27T10:00:00Z');

  it('names the end date, the day-12 card request, the price and what happens without a card', () => {
    const text = trialConsequence('pro', now);
    expect(text).toContain('free until 11 October');
    expect(text).toContain('on 9 October we');
    expect(text).toContain('US$35 a month from 11 October');
    expect(text).toContain('move back to Free on 11 October, and nothing is deleted');
  });

  it('quotes Elite at its own price, with no em dash', () => {
    const text = trialConsequence('elite', now);
    expect(text).toContain('Everything in Elite');
    expect(text).toContain('US$99 a month');
    expect(text).not.toContain('—');
  });
});
