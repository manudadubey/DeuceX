import { describe, expect, it } from 'vitest';
import { computeTensionDriver } from './tension';

describe('computeTensionDriver', () => {
  it('is null indoors regardless of everything else', () => {
    expect(
      computeTensionDriver({
        outdoor: false,
        tempMaxC: 40,
        altitudeM: 2000,
        ballDiff: true,
        rhMaxPct: 90,
        windMaxKmh: 50,
      }),
    ).toBeNull();
  });

  it('picks heat first when more than one driver qualifies', () => {
    expect(
      computeTensionDriver({
        outdoor: true,
        tempMaxC: 30,
        altitudeM: 500,
        ballDiff: true,
        rhMaxPct: 80,
        windMaxKmh: 20,
      }),
    ).toBe('heat');
  });

  it('falls back to altitude+ball when heat does not qualify', () => {
    expect(
      computeTensionDriver({
        outdoor: true,
        tempMaxC: 20,
        altitudeM: 500,
        ballDiff: true,
        rhMaxPct: 80,
        windMaxKmh: 20,
      }),
    ).toBe('altitude_ball');
  });

  it('needs both altitude and ballDiff together, not either alone', () => {
    expect(
      computeTensionDriver({
        outdoor: true,
        tempMaxC: 20,
        altitudeM: 500,
        ballDiff: false,
        rhMaxPct: 50,
        windMaxKmh: 10,
      }),
    ).toBeNull();
  });

  it('falls back to humidity+wind last', () => {
    expect(
      computeTensionDriver({
        outdoor: true,
        tempMaxC: 20,
        altitudeM: 0,
        ballDiff: false,
        rhMaxPct: 75,
        windMaxKmh: 20,
      }),
    ).toBe('humidity_wind');
  });

  it('needs wind strictly above 15 km/h, not at it', () => {
    expect(
      computeTensionDriver({
        outdoor: true,
        tempMaxC: 20,
        altitudeM: 0,
        ballDiff: false,
        rhMaxPct: 75,
        windMaxKmh: 15,
      }),
    ).toBeNull();
  });

  it('is null with no driver at all', () => {
    expect(
      computeTensionDriver({
        outdoor: true,
        tempMaxC: 20,
        altitudeM: 0,
        ballDiff: false,
        rhMaxPct: 50,
        windMaxKmh: 10,
      }),
    ).toBeNull();
  });
});
