import { computeAcceptanceStatus, acceptanceLabel } from './acceptance';
import { estimateCost } from './cost-model';
import {
  computeCostToPrizeRatio,
  computeExpectedGrossPrizeAndPoints,
  computeExpectedNet,
  computeRoundProbabilities,
  bestCaseNet,
  worstCaseNet,
} from './expected-value';
import { filterCandidate } from './filters';
import { buildRounds } from './rounds';
import type {
  CostModelPlayer,
  ExcludedCandidate,
  ExclusionReason,
  ShortlistCandidate,
  ShortlistFilters,
  ShortlistResult,
  TournamentCandidateInput,
} from './types';
import { buildWhyText } from './why-text';

const SHORTLIST_SIZE = 5;

interface Computed {
  input: TournamentCandidateInput;
  candidate: Omit<ShortlistCandidate, 'rank' | 'why'>;
  isDefenceWeek: boolean;
  exclusionReason: ExclusionReason | null;
}

function computeCandidate(
  input: TournamentCandidateInput,
  player: CostModelPlayer,
  filters: ShortlistFilters,
): Computed {
  const acceptance = computeAcceptanceStatus(
    input.rankingPosition,
    input.lastYearCut,
    input.hasQualifying,
  );
  const qualifyingLikely = acceptance === 'qualifying';
  const cost = estimateCost({
    tier: input.tier,
    city: input.city,
    qualifyingLikely,
    entryFee: input.entryFee,
    player,
  });
  const rounds = buildRounds(input.prizeTable, input.pointsTable, qualifyingLikely, cost.total);
  const probabilities = computeRoundProbabilities(acceptance, rounds.length);
  const { expectedGrossPrize, expectedPoints } = computeExpectedGrossPrizeAndPoints(
    rounds,
    probabilities,
  );
  const ratio = computeCostToPrizeRatio(cost.total, expectedGrossPrize, expectedPoints);
  const isDefenceWeek = (input.defendPoints ?? 0) > 0;
  const exclusionReason = filterCandidate(input, cost.total, acceptance, filters);

  return {
    input,
    isDefenceWeek,
    exclusionReason,
    candidate: {
      tournamentId: input.tournamentId,
      name: input.name,
      tier: input.tier,
      surface: input.surface,
      city: input.city,
      country: input.country,
      startDate: input.startDate,
      endDate: input.endDate,
      entryDeadline: input.entryDeadline,
      weekStart: input.weekStart,
      ratio,
      cost,
      rounds,
      exp: computeExpectedNet(rounds, probabilities),
      lo: worstCaseNet(rounds),
      hi: bestCaseNet(rounds),
      acceptanceStatus: acceptance,
      acceptanceLabel: acceptanceLabel(acceptance, input.lastYearCut, input.rankingPosition),
      defendPoints: input.defendPoints,
    },
  };
}

function compareByRank(a: Computed, b: Computed): number {
  if (a.candidate.ratio !== b.candidate.ratio) return a.candidate.ratio - b.candidate.ratio;
  const defA = a.input.defendPoints ?? 0;
  const defB = b.input.defendPoints ?? 0;
  if (defA !== defB) return defB - defA;
  return b.candidate.exp - a.candidate.exp;
}

// T-1 to T-4: scans the given calendar candidates (already pre-filtered to
// the player's stage-and-tour scope and the next eight weeks by the caller
// — that filtering needs the ranking snapshot and tournaments table, which
// this pure module deliberately does not touch), applies T-2's per-
// candidate filters, resolves same-week clashes in ranked order (T-2's
// fifth filter: "the better-ranked one stays"), then force-includes any
// still-missing defence week (T-4) before assigning final ranks 1..n.
export function buildShortlist(
  candidateInputs: readonly TournamentCandidateInput[],
  player: CostModelPlayer,
  filters: ShortlistFilters,
): ShortlistResult {
  const computed = candidateInputs.map((input) => computeCandidate(input, player, filters));
  const excluded: ExcludedCandidate[] = [];

  const passedFilter = computed.filter((c) => {
    if (c.exclusionReason) {
      excluded.push({
        tournamentId: c.input.tournamentId,
        name: c.input.name,
        reason: c.exclusionReason,
      });
      return false;
    }
    return true;
  });

  const sorted = [...passedFilter].sort(compareByRank);

  const accepted: Computed[] = [];
  const weekTaken = new Set<string>();
  for (const c of sorted) {
    if (weekTaken.has(c.input.weekStart)) {
      excluded.push({
        tournamentId: c.input.tournamentId,
        name: c.input.name,
        reason: 'week_clash',
      });
      continue;
    }
    weekTaken.add(c.input.weekStart);
    accepted.push(c);
  }

  let top = accepted.slice(0, SHORTLIST_SIZE);
  const rest = accepted.slice(SHORTLIST_SIZE);

  // T-4: a defence week is shortlisted regardless of where its ratio would
  // otherwise place it, as long as it cleared every T-2 filter and the
  // week-clash pass above.
  const missingDefence = rest.filter((c) => c.isDefenceWeek);
  for (const defence of missingDefence) {
    const worstIndex = [...top].reverse().findIndex((c) => !c.isDefenceWeek);
    if (worstIndex === -1) break; // top is entirely defence weeks already
    const removeAt = top.length - 1 - worstIndex;
    const [bumped] = top.splice(removeAt, 1, defence);
    if (bumped) {
      excluded.push({
        tournamentId: bumped.input.tournamentId,
        name: bumped.input.name,
        reason: 'ranked_outside_top_five',
      });
    }
  }

  for (const c of rest.filter((c) => !top.includes(c))) {
    excluded.push({
      tournamentId: c.input.tournamentId,
      name: c.input.name,
      reason: 'ranked_outside_top_five',
    });
  }

  top = [...top].sort(compareByRank);

  const candidates: ShortlistCandidate[] = top.map((c, i) => ({
    ...c.candidate,
    rank: i + 1,
    why: buildWhyText({
      rank: i + 1,
      ratio: c.candidate.ratio,
      defendPoints: c.input.defendPoints,
      defendPlacesAtRisk: c.input.defendPlacesAtRisk,
      acceptanceLabel: c.candidate.acceptanceLabel,
    }),
  }));

  return { scannedCount: candidateInputs.length, candidates, excluded };
}
