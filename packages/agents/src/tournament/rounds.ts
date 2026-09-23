import type { RoundOutcome } from './types';

// PRD-01 T-6: "one row per round from the first realistic round (Q1 when
// qualifying is likely, R1 when direct acceptance) to the semi-final."
const ROUND_ORDER = ['Q1', 'Q2', 'Q3', 'R1', 'R2', 'R3', 'R4', 'QF', 'SF'] as const;

export function buildRounds(
  prizeTable: Record<string, number>,
  pointsTable: Record<string, number>,
  qualifyingLikely: boolean,
  costToGo: number,
): RoundOutcome[] {
  const startIndex = ROUND_ORDER.indexOf(qualifyingLikely ? 'Q1' : 'R1');
  const rounds: RoundOutcome[] = [];
  for (let i = startIndex; i < ROUND_ORDER.length; i += 1) {
    const label: (typeof ROUND_ORDER)[number] = ROUND_ORDER[i]!;
    if (!(label in prizeTable)) continue;
    const prize = prizeTable[label] ?? 0;
    const points = pointsTable[label] ?? 0;
    rounds.push({
      label: rounds.length === 0 ? `Lose ${label}` : `Reach ${label}`,
      prize,
      points,
      net: prize - costToGo,
    });
  }
  return rounds;
}
