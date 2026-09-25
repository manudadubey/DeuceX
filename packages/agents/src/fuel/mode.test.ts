import { describe, expect, it } from 'vitest';
import { deriveMode, type ModeInput } from './mode';

const NOW = new Date('2026-09-12T19:15:00Z'); // 21:15 in Sibiu (UTC+3)
const h = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

function input(overrides: Partial<ModeInput> = {}): ModeInput {
  return {
    now: NOW,
    localHour: 21,
    nextMatchAt: null,
    lastMatchEndedAt: null,
    travelLegEndedAt: null,
    travelToday: false,
    ...overrides,
  };
}

describe('deriveMode (PRD-07 section 7)', () => {
  it('is Pre-match with a 10:00 match tomorrow (under 16 hours)', () => {
    expect(deriveMode(input({ nextMatchAt: h(12.75) }))).toBe('pre-match');
  });

  it('is Post-match within 6 hours of a match and none within 16', () => {
    expect(deriveMode(input({ lastMatchEndedAt: h(-3), nextMatchAt: h(40) }))).toBe('post-match');
  });

  it('prefers Pre-match when a match is close even just after one', () => {
    expect(deriveMode(input({ lastMatchEndedAt: h(-3), nextMatchAt: h(15) }))).toBe('pre-match');
  });

  it('is Travel within 6 hours of a leg, or after 22:00 on a travel day', () => {
    expect(deriveMode(input({ travelLegEndedAt: h(-2) }))).toBe('travel');
    expect(deriveMode(input({ travelToday: true, localHour: 22 }))).toBe('travel');
  });

  it('is Rest only with a match known to be over 36 hours away', () => {
    expect(deriveMode(input({ nextMatchAt: h(40) }))).toBe('rest');
    expect(deriveMode(input({ nextMatchAt: h(30) }))).toBe('practice');
  });

  it('is Practice when the next match is unknown or already past', () => {
    expect(deriveMode(input())).toBe('practice');
    expect(deriveMode(input({ nextMatchAt: h(-1) }))).toBe('practice');
  });
});
