// Deliberately decoupled from packages/db row types, same idiom as
// packages/agents/src/financial/types.ts: this module takes plain data in
// and returns plain data out, so its tests never need a live Postgres
// connection or the generated Database type.

export interface CostBreakdown {
  flights: number;
  accommodation: number;
  coach: number;
  entry: number;
  nights: number;
  route: string | null;
  total: number;
}

export interface RoundOutcome {
  label: string;
  prize: number;
  points: number;
  net: number;
}

export type AcceptanceStatus = 'direct' | 'alternate' | 'qualifying' | 'excluded';

export interface CostModelPlayer {
  homeAirport: string | null;
  coachWeeklyFee: number;
  coachTravels: boolean;
}

// One event on the calendar, in the player's stage-and-tour scope, within
// the next eight weeks (T-1). prizeTable/pointsTable are keyed by round
// label ("R1", "QF", "Q1", ...) and already in the player's home currency
// (PRD-01 section 7: "converted to home currency at the run-date rate,
// shown as such" — the conversion itself is the input assembler's job, not
// this engine's).
export interface TournamentCandidateInput {
  tournamentId: string;
  name: string;
  tier: string | null;
  surface: string | null;
  city: string | null;
  country: string | null;
  startDate: string;
  endDate: string;
  entryDeadline: string | null;
  weekStart: string;
  entryFee: number;
  hasQualifying: boolean;
  lastYearCut: number | null;
  rankingPosition: number | null;
  prizeTable: Record<string, number>;
  pointsTable: Record<string, number>;
  /** Points the player holds from this event's edition last year that expire this week (T-4); null/0 means not a defence week. */
  defendPoints: number | null;
  /** Estimated ranking places lost if the player skips a defence week (T-4's why paragraph). */
  defendPlacesAtRisk: number | null;
}

export interface ShortlistFilters {
  weeklyBudget: number | null;
  blockedDateRanges: readonly { start: string; end: string }[];
  excludedSurfaces: readonly string[];
}

export type ExclusionReason =
  | 'blocked_dates'
  | 'over_budget'
  | 'outside_acceptance_cut'
  | 'surface_excluded'
  | 'week_clash'
  /** Passed every T-2 filter but ranked outside the top five (PRD-01 section 4.1's "Also considered" list) — not one of T-2's five named filter reasons, but the UI still needs a reason string for it. */
  | 'ranked_outside_top_five';

export interface ExcludedCandidate {
  tournamentId: string;
  name: string;
  reason: ExclusionReason;
}

export interface ShortlistCandidate {
  tournamentId: string;
  rank: number;
  name: string;
  tier: string | null;
  surface: string | null;
  city: string | null;
  country: string | null;
  startDate: string;
  endDate: string;
  entryDeadline: string | null;
  weekStart: string;
  ratio: number;
  cost: CostBreakdown;
  rounds: RoundOutcome[];
  exp: number;
  lo: number;
  hi: number;
  acceptanceStatus: AcceptanceStatus;
  acceptanceLabel: string;
  defendPoints: number | null;
  why: string;
}

export interface ShortlistResult {
  scannedCount: number;
  candidates: ShortlistCandidate[];
  excluded: ExcludedCandidate[];
}
