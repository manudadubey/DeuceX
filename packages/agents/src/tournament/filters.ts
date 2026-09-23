import type {
  AcceptanceStatus,
  ExclusionReason,
  ShortlistFilters,
  TournamentCandidateInput,
} from './types';

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

// T-2: "overlaps a blocked date" — any day of the event's own dates falling
// inside a blocked range.
export function overlapsBlockedDates(
  candidate: Pick<TournamentCandidateInput, 'startDate' | 'endDate'>,
  blockedDateRanges: ShortlistFilters['blockedDateRanges'],
): boolean {
  return blockedDateRanges.some((range) =>
    overlaps(candidate.startDate, candidate.endDate, range.start, range.end),
  );
}

// T-2's five exclusion filters, in the order PRD-01 lists them, each
// producing its own exclusion reason. A defence week (T-4) is still run
// through this function — only the ranking step (rank.ts) grants it the
// force-include exception, and even then never past a blocked-dates clash,
// which is never waived for any candidate.
export function filterCandidate(
  candidate: TournamentCandidateInput,
  costToGo: number,
  acceptanceStatus: AcceptanceStatus,
  filters: ShortlistFilters,
): ExclusionReason | null {
  if (overlapsBlockedDates(candidate, filters.blockedDateRanges)) return 'blocked_dates';
  if (candidate.surface && filters.excludedSurfaces.includes(candidate.surface)) {
    return 'surface_excluded';
  }
  if (acceptanceStatus === 'excluded') return 'outside_acceptance_cut';
  const isDefenceWeek = (candidate.defendPoints ?? 0) > 0;
  if (!isDefenceWeek && filters.weeklyBudget != null && costToGo > filters.weeklyBudget) {
    return 'over_budget';
  }
  return null;
}
