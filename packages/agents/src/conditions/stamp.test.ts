import { describe, expect, it } from 'vitest';
import { buildStamp, isStampChipAt } from './stamp';

describe('buildStamp · CE-AC-9', () => {
  it('builds the Genoa stamp with no amber chip', () => {
    const chips = buildStamp({
      tempC: 24,
      rhPct: 58,
      indoorOutdoor: 'outdoor',
      surface: 'clay',
      ball: 'Dunlop Fort',
      place: 'Genoa',
    });
    expect(chips).toEqual(['24°C', '58% RH', 'outdoor clay', 'Dunlop Fort', 'Genoa']);
    expect(isStampChipAt(chips, 0)).toBe(false);
    expect(isStampChipAt(chips, 1)).toBe(false);
  });
});

describe('buildStamp · CE-AC-10 (Anning)', () => {
  it('flags the temperature and humidity chips amber, not the others', () => {
    const chips = buildStamp({
      tempC: 33,
      rhPct: 82,
      indoorOutdoor: 'outdoor',
      surface: 'hard',
      ball: 'Head Tour',
      place: null,
    });
    expect(chips).toEqual(['33°C', '82% RH', 'outdoor hard', 'Head Tour']);
    expect(isStampChipAt(chips, 0)).toBe(true);
    expect(isStampChipAt(chips, 1)).toBe(true);
    expect(isStampChipAt(chips, 2)).toBe(false);
    expect(isStampChipAt(chips, 3)).toBe(false);
  });
});

describe('buildStamp · unpublished ball', () => {
  it('falls back to the not-published label', () => {
    const chips = buildStamp({
      tempC: 20,
      rhPct: 50,
      indoorOutdoor: 'outdoor',
      surface: 'clay',
      ball: null,
      place: null,
    });
    expect(chips[3]).toBe('Ball not published yet');
  });
});
