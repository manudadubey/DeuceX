import { describe, expect, it } from 'vitest';
import { dietaryChip, foodMoneyLeft, preferencesSummary } from './context';
import { inferOutcome, inferenceDue } from './outcome';

describe('inferOutcome (FU-15)', () => {
  it('reads Confident and Energised as Worked, Flat and Frustrated as Flat', () => {
    expect(inferOutcome({ noteMoods: ['confident'], checkInValue: null })).toBe('worked');
    expect(inferOutcome({ noteMoods: ['energised'], checkInValue: null })).toBe('worked');
    expect(inferOutcome({ noteMoods: ['flat'], checkInValue: null })).toBe('flat');
    expect(inferOutcome({ noteMoods: ['frustrated'], checkInValue: 5 })).toBe('flat');
  });

  it('falls back to the check-in scale, and a 3 infers nothing', () => {
    expect(inferOutcome({ noteMoods: [], checkInValue: 4 })).toBe('worked');
    expect(inferOutcome({ noteMoods: [], checkInValue: 2 })).toBe('flat');
    expect(inferOutcome({ noteMoods: [], checkInValue: 3 })).toBeNull();
    expect(inferOutcome({ noteMoods: [], checkInValue: null })).toBeNull();
  });
});

describe('inferenceDue (FU-AC-9: by 18:00 the next day)', () => {
  it('waits until 18:00 local on the day after the meal', () => {
    expect(inferenceDue('2026-09-12', '2026-09-12', 23)).toBe(false);
    expect(inferenceDue('2026-09-12', '2026-09-13', 17)).toBe(false);
    expect(inferenceDue('2026-09-12', '2026-09-13', 18)).toBe(true);
    expect(inferenceDue('2026-09-30', '2026-10-02', 0)).toBe(true);
  });
});

describe('context chips (FU-AC-1)', () => {
  it('reads "No pork · no allergies" and the A$34 left', () => {
    expect(dietaryChip({ exclusions: ['pork'], allergies: [], preferences: ['fish'] })).toBe(
      'No pork · no allergies',
    );
    expect(foodMoneyLeft(48, [14])).toBe(34);
    expect(foodMoneyLeft(null, [14])).toBeNull();
  });

  it('summarises preferences the way the Preferences toast did', () => {
    expect(
      preferencesSummary({ exclusions: ['pork'], allergies: [], preferences: ['fish', 'chicken'] }),
    ).toBe('no pork, prefers fish and chicken · no allergies on file');
  });
});
