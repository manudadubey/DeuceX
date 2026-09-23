import type { CostBreakdown, CostModelPlayer } from './types';

// PRD-01 section 7: "Accommodation nights default to 7 for a main-draw
// event and 9 when qualifying is likely."
export const ACCOMMODATION_NIGHTS_MAIN_DRAW = 7;
export const ACCOMMODATION_NIGHTS_QUALIFYING = 9;

export function computeAccommodationNights(qualifyingLikely: boolean): number {
  return qualifyingLikely ? ACCOMMODATION_NIGHTS_QUALIFYING : ACCOMMODATION_NIGHTS_MAIN_DRAW;
}

// PRD-01 section 1's own inputs list is honest that the real flight/
// accommodation estimator is "learned from the player's own ledger where
// available, otherwise from platform medians" (T-19, a Should, deferred —
// see docs/BUILD-LOG.md's step 3.2 entry). No flights/accommodation feed is
// on TECH-ARCHITECTURE.md section 4's integrations list at all, so these are
// named, tunable placeholder constants (the same spirit as the A$60-per-
// point constant below), bucketed by a coarse tier class rather than a real
// distance or seasonal-fare model. Reviewing these with real players is
// PRD-01 section 12's own open question, extended to cover this table too.
export type TierClass = 'itf' | 'challenger' | 'wta125' | 'tour_qualifying';

export function classifyTier(tier: string | null): TierClass {
  const t = (tier ?? '').toUpperCase();
  if (t.startsWith('ITF')) return 'itf';
  if (t.startsWith('CH')) return 'challenger';
  if (t.includes('125')) return 'wta125';
  return 'tour_qualifying'; // ATP 250 / WTA 250 qualifying and anything unrecognised
}

export const PLATFORM_MEDIAN_FLIGHT_AUD: Record<TierClass, number> = {
  itf: 300,
  challenger: 450,
  wta125: 500,
  tour_qualifying: 700,
};

export const PLATFORM_MEDIAN_NIGHTLY_ACCOMMODATION_AUD: Record<TierClass, number> = {
  itf: 60,
  challenger: 80,
  wta125: 85,
  tour_qualifying: 100,
};

export interface EstimateCostInput {
  tier: string | null;
  city: string | null;
  qualifyingLikely: boolean;
  entryFee: number;
  player: CostModelPlayer;
}

// PRD-01 section 7's cost-to-go formula: flights + accommodation (nights x
// nightly estimate) + coach fee for the week + entry fee.
export function estimateCost(input: EstimateCostInput): CostBreakdown {
  const tierClass = classifyTier(input.tier);
  const nights = computeAccommodationNights(input.qualifyingLikely);
  const flights = PLATFORM_MEDIAN_FLIGHT_AUD[tierClass];
  const accommodation = PLATFORM_MEDIAN_NIGHTLY_ACCOMMODATION_AUD[tierClass] * nights;
  const coach = input.player.coachTravels ? input.player.coachWeeklyFee : 0;
  const entry = input.entryFee;
  const total = flights + accommodation + coach + entry;
  const route =
    input.player.homeAirport && input.city ? `${input.player.homeAirport} → ${input.city}` : null;
  return { flights, accommodation, coach, entry, nights, route, total };
}
