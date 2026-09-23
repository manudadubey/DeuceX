import { describe, expect, it } from 'vitest';
import {
  computeCostToPrizeRatio,
  computeExpectedGrossPrizeAndPoints,
  computeExpectedNet,
  computeRoundProbabilities,
  POINTS_VALUE_PER_POINT_AUD,
} from './expected-value';
import type { RoundOutcome } from './types';

describe('computeRoundProbabilities', () => {
  it('sums to 1 across all listed rounds (nothing beyond the semi-final row is modelled)', () => {
    const probabilities = computeRoundProbabilities('direct', 4);
    expect(probabilities).toHaveLength(4);
    expect(probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(probabilities.every((p) => p >= 0)).toBe(true);
  });
});

describe('computeExpectedNet / computeExpectedGrossPrizeAndPoints', () => {
  const rounds: RoundOutcome[] = [
    { label: 'Lose R1', prize: 1000, points: 0, net: -200 },
    { label: 'Reach R2', prize: 1500, points: 5, net: 300 },
  ];
  const probabilities = [0.6, 0.4];

  it("is a probability-weighted sum of each round's net/prize/points", () => {
    expect(computeExpectedNet(rounds, probabilities)).toBeCloseTo(0.6 * -200 + 0.4 * 300, 6);
    const { expectedGrossPrize, expectedPoints } = computeExpectedGrossPrizeAndPoints(
      rounds,
      probabilities,
    );
    expect(expectedGrossPrize).toBeCloseTo(0.6 * 1000 + 0.4 * 1500, 6);
    expect(expectedPoints).toBeCloseTo(0.4 * 5, 6);
  });
});

describe('computeCostToPrizeRatio (PRD-01 section 7)', () => {
  it('divides cost to go by expected gross prize plus points value at the named A$60/point constant', () => {
    const ratio = computeCostToPrizeRatio(1000, 500, 10);
    expect(ratio).toBeCloseTo(1000 / (500 + 10 * POINTS_VALUE_PER_POINT_AUD), 10);
  });

  it('is Infinity rather than a division error when expected value is zero', () => {
    expect(computeCostToPrizeRatio(1000, 0, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
