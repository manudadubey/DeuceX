const STEP_PERCENT = 5;
const EPSILON_PERCENT = 1e-6;

export interface Milestone {
  /** The next 5% coverage threshold above the current one, e.g. 0.15. */
  target: number;
  current: number;
  /** target x grossWeeklySpend. */
  neededWeeklyIncome: number;
  /** coverage / target, capped at 1. */
  progress: number;
  /** Extrapolated from MRR history; always null until step 4.1's patron history exists (PRD-03 section 7's own "extrapolates the six-month MRR history" needs that history to extrapolate from). */
  eta: string | null;
}

// PRD-03 section 7: "the next coverage threshold in 5 percent steps...
// required weekly patron income = target x gross spend... progress =
// coverage / target." Works in whole percent, not fractions, and rounds
// each step to a clean multiple of 5: plain float division (0.15 / 0.05)
// drifts to 2.9999999999999996, which would silently skip a step right at
// an exact threshold. No MRR-history parameter here: ETA extrapolation
// (section 7's "extrapolates the six-month MRR history") needs step 4.1's
// patron history to extrapolate from, so eta is always null below — this
// function gains that parameter when that history actually exists, not
// before.
export function computeMilestone(coverage: number, grossWeeklySpend: number): Milestone {
  const coveragePercent = coverage * 100;
  let targetPercent = Math.ceil((coveragePercent - EPSILON_PERCENT) / STEP_PERCENT) * STEP_PERCENT;
  if (targetPercent <= coveragePercent + EPSILON_PERCENT) targetPercent += STEP_PERCENT;
  targetPercent = Math.max(STEP_PERCENT, targetPercent);
  const target = targetPercent / 100;

  return {
    target,
    current: coverage,
    neededWeeklyIncome: target * grossWeeklySpend,
    progress: target > 0 ? Math.min(1, coverage / target) : 0,
    eta: null,
  };
}
