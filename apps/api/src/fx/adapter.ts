// TECH-ARCHITECTURE.md section 2.1: "a small, append-only archive of daily
// ECB reference rates (ECB publishes each currency against EUR)." Kept
// behind an interface (mirroring rankings/adapter.ts and
// transcription/adapter.ts) so fx/service.ts's storage logic — provisional
// vs ecb, "both kept, both visible in audit" — has a deterministic fixture
// to run against in tests, and so the one real implementation (ecb-adapter.ts)
// is the only place that knows the ECB feed's URL and XML shape.
export interface EcbDailyRates {
  /** The date ECB's own feed is dated, yyyy-mm-dd. On a weekend or TARGET holiday this is the last date it actually published, not "today." */
  date: string;
  /** currency (ISO 4217, never 'EUR') -> units of that currency per 1 EUR. */
  rates: Record<string, number>;
}

export interface EcbRateAdapter {
  fetchDailyRates(): Promise<EcbDailyRates>;
}
