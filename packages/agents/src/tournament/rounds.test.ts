import { describe, expect, it } from 'vitest';
import { buildRounds } from './rounds';

describe('buildRounds (PRD-01 T-6)', () => {
  it('starts from R1 when direct acceptance, and from Q1 when qualifying is likely', () => {
    const table = { Q1: 0, Q2: 0, R1: 1000, R2: 1500, QF: 2500, SF: 4000 };
    const points = { Q1: 0, Q2: 0, R1: 0, R2: 5, QF: 10, SF: 20 };

    const direct = buildRounds(table, points, false, 800);
    expect(direct[0]?.label).toBe('Lose R1');
    expect(direct.map((r) => r.label)).toEqual(['Lose R1', 'Reach R2', 'Reach QF', 'Reach SF']);

    const qualifying = buildRounds(table, points, true, 800);
    expect(qualifying[0]?.label).toBe('Lose Q1');
  });

  it('net is prize minus the cost-to-go total for every round', () => {
    const rounds = buildRounds({ R1: 1000, R2: 1500 }, { R1: 0, R2: 5 }, false, 800);
    expect(rounds.map((r) => r.net)).toEqual([200, 700]);
  });

  it('skips rounds absent from the prize table rather than inventing a zero row', () => {
    const rounds = buildRounds({ R1: 1000, QF: 2500 }, { R1: 0, QF: 10 }, false, 800);
    expect(rounds.map((r) => r.label)).toEqual(['Lose R1', 'Reach QF']);
  });
});
