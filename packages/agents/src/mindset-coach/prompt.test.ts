import { describe, expect, it } from 'vitest';
import { buildInsightPrompt } from './prompt';

const base = {
  lang: 'en',
  checkins: [
    { date: '2026-09-25', value: 1 as const, sentence: null },
    { date: '2026-09-21', value: 2 as const, sentence: null },
  ],
  patternFlagStatement: null,
  light: false,
  adapted: false,
  checkinsOnly: false,
  recentFocuses: [],
};

describe('buildInsightPrompt', () => {
  it("gives the coach the player's tags and own words, oldest first", () => {
    const { user } = buildInsightPrompt({
      ...base,
      notes: [
        {
          date: '2026-09-25',
          ctx: 'match',
          mood: 'flat',
          result: 'L 6-1 6-3',
          summary: null,
          tags: ['Heat'],
          excerpt: 'First serve would not go in.',
        },
        {
          date: '2026-09-20',
          ctx: 'practice',
          mood: 'confident',
          result: null,
          summary: 'Serve block.',
          tags: [],
        },
      ],
    });
    expect(user).toContain('tags Heat');
    expect(user).toContain('in their words "First serve would not go in."');
    expect(user.indexOf('2026-09-20 · practice')).toBeLessThan(user.indexOf('2026-09-25 · match'));
    expect(user.indexOf('2026-09-21: 2/5')).toBeLessThan(user.indexOf('2026-09-25: 1/5'));
  });

  it('asks for a specific observation and a focus the player can tick off', () => {
    const { system } = buildInsightPrompt({ ...base, notes: [] });
    expect(system).toContain('could be said to any player is a failure');
    expect(system).toContain('small enough to finish and tick off');
  });
});
