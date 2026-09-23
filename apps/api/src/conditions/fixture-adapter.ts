import type { VenueForecastResult, WeatherAdapter } from './adapter';

// Deterministic forecasts for tests, same shape as fx/fixture-adapter.ts's
// createFixtureEcbAdapter: a fixed result by default, or a caller-supplied
// one per call (including null, for the "forecast unavailable" path), with
// an optional onFetch spy.
export function createFixtureWeatherAdapter(
  result: VenueForecastResult | null = {
    tempMaxC: 22,
    tempMinC: 17,
    rhMinPct: 55,
    rhMaxPct: 65,
    windMinKmh: 8,
    windMaxKmh: 14,
  },
  onFetch?: () => void,
): WeatherAdapter {
  return {
    async fetchForecast() {
      onFetch?.();
      return result;
    },
  };
}
