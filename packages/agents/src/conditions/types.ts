// Deliberately decoupled from packages/db row types, same idiom as
// packages/agents/src/tournament/types.ts: this module takes plain data in
// and returns plain data out.

export type Unit = 'kg' | 'lb';

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
  source: 'open-meteo' | 'climate-normals';
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
  tempMaxC: number;
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
  forecastSource: 'open-meteo' | 'climate-normals';
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
