import type { FinancialLedgerLine } from './types';

export interface MonthlyPnlInput {
  expensesInMonth: readonly FinancialLedgerLine[];
  /** Prize income actually received this month, net of withholding, already converted to home currency at its realised rate. */
  receivedPrizeIncomeHome: readonly number[];
  /** Patron payouts actually received this month, after fees. Always empty until step 4.1's patrons/payouts tables exist (packages/agents/src/financial's own stub — see apps/api/src/financial/service.ts). */
  receivedPatronPayoutsHome: readonly number[];
}

export interface MonthlyPnl {
  income: number;
  spend: number;
  net: number;
}

// PRD-03 F-19 / decisions worksheet 7 (the September P&L bug fix): "in =
// received prize net of withholding + patron payouts received... pending
// receivables and gross MRR are excluded." Structurally excluded here by
// never taking a pending receivable as an argument at all, rather than
// filtering one out — there is no "pending" input for this function to
// accidentally include.
export function computeMonthlyPnl(input: MonthlyPnlInput): MonthlyPnl {
  const income = sum(input.receivedPrizeIncomeHome) + sum(input.receivedPatronPayoutsHome);
  const spend = sum(input.expensesInMonth.map((l) => l.amountHome));
  return { income, spend, net: income - spend };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
