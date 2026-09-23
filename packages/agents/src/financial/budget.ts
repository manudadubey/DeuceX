import type { FinancialBudgetEstimate, FinancialLedgerLine } from './types';

export interface BudgetVsActualRow {
  label: string;
  estimateAmount: number;
  actualAmount: number;
  /** Signed whole percent, (actual - estimate) / estimate; null when nothing has been logged yet ("not started", F-16). */
  variancePercent: number | null;
  over: boolean;
}

// PRD-03 F-16/section 7: "variance = (actual - estimate) / estimate as a
// signed whole percent" (Genoa est 1,900, actual 2,425, +28%; Sibiu est 960,
// actual 130, -86%), or "not started" when nothing has been logged against
// that label yet.
export function computeBudgetVsActual(
  estimates: readonly FinancialBudgetEstimate[],
  lines: readonly FinancialLedgerLine[],
): BudgetVsActualRow[] {
  return estimates.map((estimate) => {
    const actualAmount = lines
      .filter((l) => l.label === estimate.label)
      .reduce((sum, l) => sum + l.amountHome, 0);

    if (actualAmount === 0) {
      return {
        label: estimate.label,
        estimateAmount: estimate.estimateAmount,
        actualAmount: 0,
        variancePercent: null,
        over: false,
      };
    }

    const variancePercent = Math.round(
      ((actualAmount - estimate.estimateAmount) / estimate.estimateAmount) * 100,
    );
    return {
      label: estimate.label,
      estimateAmount: estimate.estimateAmount,
      actualAmount,
      variancePercent,
      over: actualAmount > estimate.estimateAmount,
    };
  });
}

export type WeeklyBudgetState = 'ok' | 'amber' | 'red';

export interface WeeklyBudgetBar {
  spent: number;
  budget: number;
  /** Capped at 100 for the bar's own width, even when spent exceeds budget. */
  percent: number;
  state: WeeklyBudgetState;
  overAmount: number;
}

const AMBER_THRESHOLD = 0.8;

function startOfWeek(date: Date): Date {
  // Monday to Sunday (F-17's own wording), UTC-based since ledger dates are
  // plain calendar dates with no timezone attached.
  const day = date.getUTCDay();
  const diff = (day + 6) % 7; // days since Monday
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - diff);
  return start;
}

// PRD-03 F-17: "sums expenses dated Monday to Sunday of the current week
// against the budget, turns amber above 80 percent and red when over."
export function computeWeeklyBudgetBar(
  lines: readonly FinancialLedgerLine[],
  weeklyBudget: number,
  now: Date = new Date(),
): WeeklyBudgetBar {
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const spent = lines
    .filter((l) => {
      const d = new Date(l.date);
      return d >= weekStart && d < weekEnd;
    })
    .reduce((sum, l) => sum + l.amountHome, 0);

  const ratio = weeklyBudget > 0 ? spent / weeklyBudget : 0;
  const state: WeeklyBudgetState =
    spent > weeklyBudget ? 'red' : ratio >= AMBER_THRESHOLD ? 'amber' : 'ok';

  return {
    spent,
    budget: weeklyBudget,
    percent: Math.min(100, Math.round(ratio * 100)),
    state,
    overAmount: Math.max(0, spent - weeklyBudget),
  };
}
