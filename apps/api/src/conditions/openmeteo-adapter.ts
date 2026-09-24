import type { FetchVenueForecastInput, VenueForecastResult, WeatherAdapter } from './adapter';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const DAILY_FIELDS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'relative_humidity_2m_mean',
  'wind_speed_10m_max',
].join(',');

export interface OpenMeteoDailyResponse {
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    relative_humidity_2m_mean: number[];
    wind_speed_10m_max: number[];
  };
  error?: boolean;
  reason?: string;
}

function rangeOf(values: readonly number[]): [number, number] {
  return [Math.min(...values), Math.max(...values)];
}

// Pure and exported so openmeteo-adapter.test.ts can prove it against a
// realistic fixture body with no network call — mirrors fx/ecb-adapter.ts's
// own parseEcbDailyXml split.
export function parseOpenMeteoResponse(body: OpenMeteoDailyResponse): VenueForecastResult | null {
  if (body.error || !body.daily) return null;

  const [tempMinC, tempMaxC] = rangeOf([
    ...body.daily.temperature_2m_min,
    ...body.daily.temperature_2m_max,
  ]);
  const [rhMinPct, rhMaxPct] = rangeOf(body.daily.relative_humidity_2m_mean);
  const [windMinKmh, windMaxKmh] = rangeOf(body.daily.wind_speed_10m_max);

  return { tempMaxC, tempMinC, rhMinPct, rhMaxPct, windMinKmh, windMaxKmh };
}

// The only production implementation: Open-Meteo's forecast API is free and
// unauthenticated (no key, unlike Whisper or R2), so — same as
// fx/ecb-adapter.ts's own comment — there is no fixture-vs-real fallback
// branch in apps/api/src/index.ts; this adapter is always wired in. A date
// range beyond the provider's ~16-day horizon comes back as
// `{error: true, reason: "..."}` with a 200 status (confirmed live against
// the real API while building this step) rather than a non-2xx, which is
// why both cases are checked and both return null, not throw — that is the
// ordinary "forecast unavailable, fall back to climate normals" case
// PRD-08 CE-19 describes, not an adapter failure.
export function createOpenMeteoAdapter(): WeatherAdapter {
  return {
    async fetchForecast(input: FetchVenueForecastInput): Promise<VenueForecastResult | null> {
      const url = new URL(OPEN_METEO_URL);
      url.searchParams.set('latitude', String(input.lat));
      url.searchParams.set('longitude', String(input.lon));
      url.searchParams.set('daily', DAILY_FIELDS);
      url.searchParams.set('timezone', 'UTC');
      url.searchParams.set('start_date', input.startDate);
      url.searchParams.set('end_date', input.endDate);

      const response = await fetch(url.toString());
      if (!response.ok) return null;

      const body = (await response.json()) as OpenMeteoDailyResponse;
      return parseOpenMeteoResponse(body);
    },
  };
}
