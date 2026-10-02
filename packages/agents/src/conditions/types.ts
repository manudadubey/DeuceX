// Deliberately decoupled from packages/db row types, same idiom as
// packages/agents/src/tournament/types.ts: this module takes plain data in
// and returns plain data out.

export type Unit = 'kg' | 'lb';

/**
 * Where a brief's numbers came from. 'google' is Google's Weather API, whose terms (Maps
 * Service Specific Terms 21.2) allow a daily forecast to be kept for 24 hours only, so a
 * google-sourced brief is refreshed or replaced within that window (refresh-scheduler.ts).
 */
export type ForecastSource = 'google' | 'open-meteo' | 'climate-normals';

/** A stamp's weather, as DeuceX's own bands rather than the provider's numbers (see stamp.ts). */
export type TempBand = 'Hot' | 'Warm' | 'Mild' | 'Cool';
export type HumidityBand = 'Humid' | 'Moderate humidity' | 'Dry air';

export interface VenueForecastInput {
  /** Forecast maximum across the match days, °C. Drives the Air amber rule (section 7). */
  tempMaxC: number;
  /** Forecast minimum across the match days, °C, for the tile's display range. */
  tempMinC: number;
  rhMinPct: number;
  /** Forecast maximum humidity across the match days, percent. Drives the Air amber rule. */
  rhMaxPct: number;
  /** Null indoors (PRD-08 4.1: "wind shows 'None'"). */
  windMinKmh: number | null;
  windMaxKmh: number | null;
  source: ForecastSource;
  /** False when the Air tile reads "not refreshed" (CE-19). */
  refreshed: boolean;
  fetchedAt: string;
}

export interface TournamentFactSheetInput {
  tournamentId: string;
  name: string;
  surface: string | null;
  indoorOutdoor: 'indoor' | 'outdoor' | null;
  city: string | null;
  altitudeM: number | null;
  /** Null means "Ball not published yet" (CE section 3 failure behaviour). */
  ball: string | null;
}

export interface EquipmentProfileInput {
  mainsKg: number;
  crossesKg: number;
  framesCarried: number;
  practiceBalls: readonly string[];
  version: number;
}

export interface PreviousStampedEventInput {
  place: string;
  tempBand: TempBand;
  humidityBand: HumidityBand;
  ball: string | null;
}

export interface ConditionsBriefRuleInput {
  tournament: TournamentFactSheetInput;
  forecast: VenueForecastInput;
  equipment: EquipmentProfileInput;
  previousEvent: PreviousStampedEventInput | null;
}

export interface ConditionsBriefRules {
  tempRange: string;
  tempMax: number;
  rhRange: string;
  rhMax: number;
  wind: string;
  altitudeM: number | null;
  ball: string | null;
  ballDiff: boolean;
  io: string;
  airAmber: boolean;
  tension: boolean;
  tensionNote: string;
  testMains: number | null;
  testCrosses: number | null;
  frames: number;
  framesSubLine: string;
  grip: string;
  refreshed: boolean;
  forecastSource: ForecastSource;
}

export interface ConditionsBrief extends ConditionsBriefRules {
  tournamentId: string;
  /** The comparison-plus-practice sentence (CE-6), one model call per batch — see prose.ts. */
  diff: string;
  practice: string;
}

/** PRD-08 section 6's Stamp, attached to a Match note (CE-11). */
export interface ConditionsStampInput {
  tempC: number;
  rhPct: number;
  indoorOutdoor: 'indoor' | 'outdoor' | null;
  surface: string | null;
  ball: string | null;
  place: string | null;
}
