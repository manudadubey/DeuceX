// PRD-08 section 7: "Air is amber when tempMax >= 28C; humidity when rhMax
// >= 70 percent. Both are fixed by the prototype." Stamps (stamp.ts) apply
// the same thresholds to the single match-time values. These are also the
// numbers packages/agents/src/mindset-coach/rules.ts's own
// detectConditionsFirstServe rule now uses for its hot/cool split (step 3.3
// follow-up to that rule's own step-1.3 placeholder comment) — kept as a
// literal there rather than a cross-submodule import, to keep that already-
// shipped, already-tested module untouched beyond the two numbers.
export const AMBER_TEMP_C = 28;
export const AMBER_HUMIDITY_PCT = 70;

export function isAirAmber(tempMaxC: number, rhMaxPct: number): boolean {
  return tempMaxC >= AMBER_TEMP_C || rhMaxPct >= AMBER_HUMIDITY_PCT;
}

export function isStampChipAmber(tempC: number, rhPct: number): boolean {
  return tempC >= AMBER_TEMP_C || rhPct >= AMBER_HUMIDITY_PCT;
}
