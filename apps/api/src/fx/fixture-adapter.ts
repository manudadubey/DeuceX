import type { EcbDailyRates, EcbRateAdapter } from './adapter';

// Deterministic rates for tests (same shape as rankings/fixture-adapter.ts's
// createFixtureRankingAdapter): a fixed result by default, or a caller-
// supplied one per call, with an optional onFetch spy.
export function createFixtureEcbAdapter(
  result: EcbDailyRates = { date: '2026-09-19', rates: { AUD: 1.651, USD: 1.085, CNY: 7.842 } },
  onFetch?: () => void,
): EcbRateAdapter {
  return {
    async fetchDailyRates(): Promise<EcbDailyRates> {
      onFetch?.();
      return result;
    },
  };
}
