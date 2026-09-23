// Shared input shapes for the Financial Agent's pure calculation modules
// (runway.ts, pnl.ts, budget.ts, milestone.ts, action-candidates.ts). Kept
// separate from packages/db's row types the same way mindset-coach/types.ts
// is: these are what the calculation functions need, not a database row.

export interface FinancialLedgerLine {
  id: string;
  date: string;
  category: string;
  what: string;
  amountHome: number;
  label: string | null;
}

export interface FinancialReserveEntry {
  amount: number;
  enteredAt: string;
}

export interface FinancialPendingReceivable {
  id: string;
  label: string;
  amountHomeEstimate: number;
  expectedDate: string;
}

export interface FinancialReceivedReceivable {
  amountHome: number;
  receivedAt: string;
}

export interface FinancialBudgetEstimate {
  label: string;
  estimateAmount: number;
  estimatedAt: string;
}
