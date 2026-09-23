import { describe, expect, it } from 'vitest';
import { parseOpenMeteoResponse } from './openmeteo-adapter';

// A trimmed but structurally faithful fixture of the real Open-Meteo
// response (confirmed live against api.open-meteo.com while building this
// step — see this file's sibling adapter for the request shape).
const FIXTURE_BODY = {
  daily: {
    time: ['2026-09-28', '2026-09-29'],
    temperature_2m_max: [21.4, 23.2],
    temperature_2m_min: [11.2, 12.0],
    relative_humidity_2m_mean: [76, 79],
    wind_speed_10m_max: [12.8, 7.4],
  },
};

describe('parseOpenMeteoResponse', () => {
  it('extracts a range across the given days', () => {
    const result = parseOpenMeteoResponse(FIXTURE_BODY);
    expect(result).toEqual({
      tempMinC: 11.2,
      tempMaxC: 23.2,
      rhMinPct: 76,
      rhMaxPct: 79,
      windMinKmh: 7.4,
      windMaxKmh: 12.8,
    });
  });

  // Confirmed live: a date range beyond Open-Meteo's ~16-day horizon comes
  // back as {error: true, reason: "..."} with an HTTP 200, not a non-2xx.
  it('returns null on the provider error shape', () => {
    expect(parseOpenMeteoResponse({ error: true, reason: 'out of range' })).toBeNull();
  });

  it('returns null when there is no daily block at all', () => {
    expect(parseOpenMeteoResponse({})).toBeNull();
  });
});
