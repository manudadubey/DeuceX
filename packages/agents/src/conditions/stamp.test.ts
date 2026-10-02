import { describe, expect, it } from 'vitest';
import {
  buildStamp,
  humidityBandFor,
  isBandStamp,
  isStampChipAt,
  stampBands,
  tempBandFor,
} from './stamp';

describe('buildStamp · CE-AC-9', () => {
  it('builds the Genoa stamp from bands, with no amber chip', () => {
    const chips = buildStamp({
      tempC: 24,
      rhPct: 58,
      indoorOutdoor: 'outdoor',
      surface: 'clay',
      ball: 'Dunlop Fort',
      place: 'Genoa',
    });
    expect(chips).toEqual(['Warm', 'Moderate humidity', 'outdoor clay', 'Dunlop Fort', 'Genoa']);
    expect(isStampChipAt(chips, 0)).toBe(false);
    expect(isStampChipAt(chips, 1)).toBe(false);
  });

  it('never stores the provider numbers', () => {
    const chips = buildStamp({
      tempC: 24.4,
      rhPct: 58,
      indoorOutdoor: 'outdoor',
      surface: 'clay',
      ball: 'Dunlop Fort',
      place: 'Genoa',
    });
    expect(chips.join(' ')).not.toMatch(/\d/);
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
    expect(chips).toEqual(['Hot', 'Humid', 'outdoor hard', 'Head Tour']);
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

describe('bands', () => {
  it('puts the band edges on the amber thresholds', () => {
    expect(tempBandFor(27.9)).toBe('Warm');
    expect(tempBandFor(28)).toBe('Hot');
    expect(tempBandFor(19.9)).toBe('Mild');
    expect(tempBandFor(11.9)).toBe('Cool');
    expect(humidityBandFor(69.9)).toBe('Moderate humidity');
    expect(humidityBandFor(70)).toBe('Humid');
    expect(humidityBandFor(39)).toBe('Dry air');
  });
});

describe('stampBands · both shapes', () => {
  it('reads a band stamp', () => {
    expect(stampBands(['Hot', 'Dry air', 'outdoor hard', 'Head Tour'])).toEqual({
      tempBand: 'Hot',
      humidityBand: 'Dry air',
    });
    expect(isBandStamp(['Hot', 'Dry air'])).toBe(true);
  });

  it('reads a numeric stamp saved before bands', () => {
    const legacy = ['33°C', '82% RH', 'outdoor hard', 'Head Tour'];
    expect(stampBands(legacy)).toEqual({ tempBand: 'Hot', humidityBand: 'Humid' });
    expect(isBandStamp(legacy)).toBe(false);
    expect(isStampChipAt(legacy, 0)).toBe(true);
  });

  it('returns null for an unreadable stamp', () => {
    expect(stampBands(['outdoor hard'])).toBeNull();
  });
});
