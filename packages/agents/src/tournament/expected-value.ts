import type { AcceptanceStatus, RoundOutcome } from './types';

// PRD-01 section 7: "Round probabilities come from the player's twelve-
// month record at that tier and surface, smoothed toward the platform
// prior for the player's ranking band." No structured, tier-and-surface
// win/loss record exists yet (Match Scribe's notes.res is free text per
// note, not an aggregated record) — T-19-style learning from real match
// history is a named follow-up, not this step's job. This is the platform
// prior alone: a fixed per-round win probability by acceptance confidence,
// the same "named, tunable placeholder" spirit as the cost model and the
// points-value constant below.
export const BASE_ROUND_WIN_PROBABILITY: Record<AcceptanceStatus, number> = {
  direct: 0.58,
  alternate: 0.5,
  qualifying: 0.42,
  excluded: 0.3,
};

// Given n rounds in order (the first realistic round to the semi-final,
// T-6), returns P(reaching exactly round i) for each i, using a geometric
// "win the round to advance" model with a single base probability. The
// last round folds in "reached this round or went further" (the outcome
// table stops at SF per T-6, so there is nothing further to model).
export function computeRoundProbabilities(
  acceptance: AcceptanceStatus,
  roundCount: number,
): number[] {
  const p = BASE_ROUND_WIN_PROBABILITY[acceptance];
  const reachAtLeast: number[] = [];
  let cumulative = 1;
  for (let i = 0; i < roundCount; i += 1) {
    reachAtLeast.push(cumulative);
    cumulative *= p;
  }
  return reachAtLeast.map((r, i) => (i < roundCount - 1 ? r - (reachAtLeast[i + 1] ?? 0) : r));
}

// PRD-01 section 7: "Expected net = Σ over rounds of P(reaching exactly
// that round) × net(round)."
export function computeExpectedNet(
  rounds: readonly RoundOutcome[],
  probabilities: number[],
): number {
  return rounds.reduce((sum, round, i) => sum + (probabilities[i] ?? 0) * round.net, 0);
}

export function computeExpectedGrossPrizeAndPoints(
  rounds: readonly RoundOutcome[],
  probabilities: number[],
): { expectedGrossPrize: number; expectedPoints: number } {
  const expectedGrossPrize = rounds.reduce(
    (sum, round, i) => sum + (probabilities[i] ?? 0) * round.prize,
    0,
  );
  const expectedPoints = rounds.reduce(
    (sum, round, i) => sum + (probabilities[i] ?? 0) * round.points,
    0,
  );
  return { expectedGrossPrize, expectedPoints };
}

// PRD-01 section 7: worst case = net of the first realistic round; best
// case = net of the semi-final row (the last row in `rounds`, T-6).
export function worstCaseNet(rounds: readonly RoundOutcome[]): number {
  return rounds[0]?.net ?? 0;
}

export function bestCaseNet(rounds: readonly RoundOutcome[]): number {
  return rounds[rounds.length - 1]?.net ?? 0;
}

// PRD-01 section 7: "Cost-to-prize ratio = cost to go ÷ (expected gross
// prize + points value), where points value converts expected points into
// money using the player's stage constant." A$60 per ATP point is PRD-01's
// own named placeholder ("Release 1: A$60 per ATP point, adjustable per
// stage in configuration" — section 7; reviewing it with players is section
// 12's open question), kept as one constant here since Release 1 does not
// yet vary it by stage.
export const POINTS_VALUE_PER_POINT_AUD = 60;

export function computeCostToPrizeRatio(
  costToGo: number,
  expectedGrossPrize: number,
  expectedPoints: number,
): number {
  const denominator = expectedGrossPrize + expectedPoints * POINTS_VALUE_PER_POINT_AUD;
  if (denominator <= 0) return Number.POSITIVE_INFINITY;
  return costToGo / denominator;
}
