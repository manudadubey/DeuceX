// TECH-ARCHITECTURE.md section 4: "Weather forecast by venue coordinates...
// Open-Meteo is free with no key at this volume." Kept behind an interface
// (mirroring fx/adapter.ts and rankings/adapter.ts) so the deterministic
// rule engine (packages/agents/src/conditions) has a fixture to run
// against, and so the one real implementation (openmeteo-adapter.ts) is the
// only place that knows Open-Meteo's URL and response shape.
export interface VenueForecastResult {
  tempMaxC: number;
  tempMinC: number;
  rhMinPct: number;
  rhMaxPct: number;
  windMinKmh: number;
  windMaxKmh: number;
}

export interface FetchVenueForecastInput {
  lat: number;
  lon: number;
  /** Match days, inclusive, as yyyy-mm-dd. */
  startDate: string;
  endDate: string;
}

// Returns null when the venue/date range is outside the provider's horizon
// or the request otherwise fails — CE-19's "forecast unavailable" case,
// which the caller (service.ts) covers with climate normals. This adapter
// never throws for that ordinary case; it throws only for a genuine
// programming error (a malformed input), so a caller can tell "no forecast"
// from "adapter is broken".
export interface WeatherAdapter {
  fetchForecast(input: FetchVenueForecastInput): Promise<VenueForecastResult | null>;
}
