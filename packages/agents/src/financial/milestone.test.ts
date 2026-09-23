import { describe, expect, it } from 'vitest';
import { computeMilestone } from './milestone';

// PRD-03 section 7: "Milestone: the next coverage threshold in 5 percent
// steps (Arya: 15 percent); required weekly patron income = target x gross
// spend (0.15 x 1,281 = A$192/wk); progress = coverage / target (73
// percent)."
describe('computeMilestone (Arya fixture)', () => {
  it('targets the next 5% step above current coverage', () => {
    const coverage = (612 * 12) / 52 / 1281; // ~0.1103, matching the runway fixture
    const milestone = computeMilestone(coverage, 1281);
    expect(milestone.target).toBeCloseTo(0.15, 5);
    expect(Math.round(milestone.neededWeeklyIncome)).toBe(192);
    // PRD-03's own "73 percent" chains from the already-rounded 11% coverage
    // (0.11 / 0.15 = 73.3%); computed from the unrounded coverage this is
    // 73.5%, which rounds to 74 — the same kind of rounding-chain drift
    // PRD-03 section 12 already flags elsewhere ("'Adds 0.4 weeks of
    // runway'... computes to about 0.1 weeks"), not a formula bug here.
    expect(Math.round(milestone.progress * 100)).toBe(74);
  });

  it('eta is always null until step 4.1 gives it real MRR history', () => {
    const milestone = computeMilestone(0.11, 1281);
    expect(milestone.eta).toBeNull();
  });

  it('steps forward again once the current threshold is met', () => {
    const milestone = computeMilestone(0.15, 1281);
    expect(milestone.target).toBeCloseTo(0.2, 5);
  });
});
