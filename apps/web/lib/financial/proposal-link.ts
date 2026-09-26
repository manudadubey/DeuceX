import type { FinancialAction } from './load';

// The run a "Mark received" approval answers (PRD-13 AD-13's approval rate):
// only when the Financial Agent's current one thing is chasing this very
// receivable. Marking any other one received isn't an answer to a proposal,
// so it links nothing rather than inflating the agent's rate.
export function receivableProposalRunId(
  action: FinancialAction | null,
  receivableId: string,
): string | null {
  return action?.candidateKey === 'chase_overdue_receivable' && action.receivableId === receivableId
    ? action.runId
    : null;
}
