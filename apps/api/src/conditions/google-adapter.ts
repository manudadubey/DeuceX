import type { FetchVenueForecastInput, VenueForecastResult, WeatherAdapter } from './adapter';

const GOOGLE_DAYS_URL = 'https://weather.googleapis.com/v1/forecast/days:lookup';
/** Google's daily forecast covers today plus nine days; one page holds all ten. */
const MAX_DAYS = 10;
/**
 * How long one venue's forecast is reused in memory. Google's terms (Maps Service Specific
 * Terms 21.2.1) allow daily forecast values to be cached for 24 hours; six keeps the hourly
 * refresh tick from calling Google every hour for every Entered event while staying well inside.
 */
export const GOOGLE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface GoogleDayPart {
  relativeHumidity?: number;
  wind?: { speed?: { value?: number } };
}

export interface GoogleForecastDay {
  displayDate?: { year: number; month: number; day: number };
  maxTemperature?: { degrees?: number };
  minTemperature?: { degrees?: number };
  daytimeForecast?: GoogleDayPart;
  nighttimeForecast?: GoogleDayPart;
}

export interface GoogleDaysResponse {
  forecastDays?: GoogleForecastDay[];
}

function isoDate(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

function numbers(values: readonly (number | undefined)[]): number[] {
  return values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

// Pure and exported for google-adapter.test.ts, the same split as
// parseOpenMeteoResponse. Keeps only the match days Google covers: its
// horizon is ten days against Open-Meteo's sixteen, so an event that starts
// inside it but ends beyond gets the days that are known, not nothing.
// None covered (a past event, or one more than ten days out) is null, the
// ordinary CE-19 fallback to climate normals.
export function parseGoogleDaysResponse(
  body: GoogleDaysResponse,
  startDate: string,
  endDate: string,
): VenueForecastResult | null {
  const days = (body.forecastDays ?? []).filter((d) => {
    if (!d.displayDate) return false;
    const date = isoDate(d.displayDate);
    return date >= startDate && date <= endDate;
  });
  if (days.length === 0) return null;

  const max = numbers(days.map((d) => d.maxTemperature?.degrees));
  const min = numbers(days.map((d) => d.minTemperature?.degrees));
  const parts = days.flatMap((d) => [d.daytimeForecast, d.nighttimeForecast]);
  const rh = numbers(parts.map((p) => p?.relativeHumidity));
  const wind = numbers(parts.map((p) => p?.wind?.speed?.value));
  if (max.length === 0 || min.length === 0 || rh.length === 0 || wind.length === 0) return null;

  return {
    tempMaxC: Math.max(...max),
    tempMinC: Math.min(...min),
    rhMinPct: Math.min(...rh),
    rhMaxPct: Math.max(...rh),
    windMinKmh: Math.min(...wind),
    windMaxKmh: Math.max(...wind),
  };
}

export interface GoogleWeatherAdapterOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

// Google's Weather API (owner decision, 3 October 2026: replaces Open-Meteo,
// whose free API excludes commercial use). Used when GOOGLE_WEATHER_API_KEY
// is set; Open-Meteo remains the keyless fallback for dev and staging.
// Two rules from Google's terms shape the rest of the Conditions code:
// daily forecasts are kept 24 hours at most (refresh-scheduler.ts), and
// stamps keep bands, not values (packages/agents conditions/stamp.ts).
export function createGoogleWeatherAdapter(options: GoogleWeatherAdapterOptions): WeatherAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { at: number; body: GoogleDaysResponse }>();

  async function lookup(lat: number, lon: number): Promise<GoogleDaysResponse | null> {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < GOOGLE_CACHE_TTL_MS) return hit.body;

    const url = new URL(GOOGLE_DAYS_URL);
    url.searchParams.set('key', options.apiKey);
    url.searchParams.set('location.latitude', String(lat));
    url.searchParams.set('location.longitude', String(lon));
    url.searchParams.set('days', String(MAX_DAYS));
    url.searchParams.set('pageSize', String(MAX_DAYS));
    url.searchParams.set('unitsSystem', 'METRIC');

    const response = await fetchImpl(url.toString());
    if (!response.ok) return null;
    const body = (await response.json()) as GoogleDaysResponse;
    for (const [k, v] of cache) if (now() - v.at >= GOOGLE_CACHE_TTL_MS) cache.delete(k);
    cache.set(key, { at: now(), body });
    return body;
  }

  return {
    source: 'google',
    async fetchForecast(input: FetchVenueForecastInput): Promise<VenueForecastResult | null> {
      const body = await lookup(input.lat, input.lon);
      if (!body) return null;
      return parseGoogleDaysResponse(body, input.startDate, input.endDate);
    },
  };
}
