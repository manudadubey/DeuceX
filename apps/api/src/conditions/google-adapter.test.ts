import { describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_CACHE_TTL_MS,
  createGoogleWeatherAdapter,
  parseGoogleDaysResponse,
  type GoogleDaysResponse,
} from './google-adapter';

// Trimmed to the fields the adapter reads, in the documented forecast.days
// response shape (developers.google.com/maps/documentation/weather).
function day(
  date: string,
  max: number,
  min: number,
  rh: [number, number],
  wind: [number, number],
): NonNullable<GoogleDaysResponse['forecastDays']>[number] {
  const [year, month, d] = date.split('-').map(Number) as [number, number, number];
  return {
    displayDate: { year, month, day: d },
    maxTemperature: { degrees: max },
    minTemperature: { degrees: min },
    daytimeForecast: { relativeHumidity: rh[0], wind: { speed: { value: wind[0] } } },
    nighttimeForecast: { relativeHumidity: rh[1], wind: { speed: { value: wind[1] } } },
  };
}

const BODY: GoogleDaysResponse = {
  forecastDays: [
    day('2026-10-03', 19, 9, [55, 80], [10, 6]),
    day('2026-10-04', 23.2, 11.2, [60, 79], [12.8, 7.4]),
    day('2026-10-05', 21.4, 12, [58, 76], [9, 5]),
  ],
};

describe('parseGoogleDaysResponse', () => {
  it('ranges across the match days only', () => {
    expect(parseGoogleDaysResponse(BODY, '2026-10-04', '2026-10-05')).toEqual({
      tempMaxC: 23.2,
      tempMinC: 11.2,
      rhMinPct: 58,
      rhMaxPct: 79,
      windMinKmh: 5,
      windMaxKmh: 12.8,
    });
  });

  it('uses the covered days when the event runs past the ten-day horizon', () => {
    const result = parseGoogleDaysResponse(BODY, '2026-10-05', '2026-10-11');
    expect(result?.tempMaxC).toBe(21.4);
  });

  it('returns null when no match day is covered', () => {
    expect(parseGoogleDaysResponse(BODY, '2026-10-20', '2026-10-26')).toBeNull();
    expect(parseGoogleDaysResponse({}, '2026-10-04', '2026-10-05')).toBeNull();
  });
});

describe('createGoogleWeatherAdapter', () => {
  function adapterWith(clock: { t: number }) {
    const fetchImpl = vi.fn<(url: string) => Promise<Response>>(
      async () => new Response(JSON.stringify(BODY), { status: 200 }),
    );
    const adapter = createGoogleWeatherAdapter({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => clock.t,
    });
    return { adapter, fetchImpl };
  }
  const input = { lat: 52.41, lon: 16.93, startDate: '2026-10-04', endDate: '2026-10-05' };

  it('asks for ten days in one page, metric', async () => {
    const { adapter, fetchImpl } = adapterWith({ t: 0 });
    await adapter.fetchForecast(input);
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/v1/forecast/days:lookup');
    expect(url.searchParams.get('days')).toBe('10');
    expect(url.searchParams.get('pageSize')).toBe('10');
    expect(url.searchParams.get('unitsSystem')).toBe('METRIC');
    expect(adapter.source).toBe('google');
  });

  it('reuses a venue forecast inside the cache window and refetches after it', async () => {
    const clock = { t: 0 };
    const { adapter, fetchImpl } = adapterWith(clock);
    await adapter.fetchForecast(input);
    clock.t = GOOGLE_CACHE_TTL_MS - 1;
    await adapter.fetchForecast(input);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock.t = GOOGLE_CACHE_TTL_MS;
    await adapter.fetchForecast(input);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps the cache window inside the 24 hours Google allows', () => {
    expect(GOOGLE_CACHE_TTL_MS).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it('returns null on a non-2xx', async () => {
    const adapter = createGoogleWeatherAdapter({
      apiKey: 'k',
      fetchImpl: (async () => new Response('denied', { status: 403 })) as unknown as typeof fetch,
    });
    expect(await adapter.fetchForecast(input)).toBeNull();
  });
});
