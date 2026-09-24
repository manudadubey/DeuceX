import { describe, expect, it } from 'vitest';
import { isAirAmber, isStampChipAmber, AMBER_TEMP_C, AMBER_HUMIDITY_PCT } from './amber';

describe('isAirAmber', () => {
  it('is not amber below both thresholds', () => {
    expect(isAirAmber(27.9, 69.9)).toBe(false);
  });
  it('is amber at the temperature threshold', () => {
    expect(isAirAmber(AMBER_TEMP_C, 0)).toBe(true);
  });
  it('is amber at the humidity threshold', () => {
    expect(isAirAmber(0, AMBER_HUMIDITY_PCT)).toBe(true);
  });
  // The review register's own B1 finding: a range like "24-29C" must be
  // evaluated on the maximum, not the lower bound the prototype's own bug
  // read instead.
  it('evaluates the forecast maximum, not the minimum', () => {
    expect(isAirAmber(29, 40)).toBe(true);
  });
});

describe('isStampChipAmber', () => {
  it('matches the Anning fixture', () => {
    expect(isStampChipAmber(33, 82)).toBe(true);
  });
  it('matches the Genoa fixture', () => {
    expect(isStampChipAmber(24, 58)).toBe(false);
  });
});
