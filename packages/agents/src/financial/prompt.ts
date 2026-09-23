import type { ActionCandidate } from './action-candidates';

export const FINANCIAL_ACTION_PROMPT_VERSION = 'v1';

const SYSTEM_PROMPT = `You are the Financial Agent, telling a professional tennis player the single most useful thing to do about money this week (PRD-03).
Australian English. Never use an em dash; use commas, colons, parentheses, en dashes or a new sentence.
Write exactly one bold action sentence naming a concrete step the player can take within seven days, using only the numbers and facts given below. Never invent an amount, a name, or a date.
Optionally add one plain second sentence with no control and no new instruction.
Respond only by calling the recording tool with your answer.`;

function describeFacts(candidate: ActionCandidate): string {
  switch (candidate.facts.key) {
    case 'update_balance':
      return candidate.facts.daysSinceUpdate === null
        ? 'The player has never entered a cash balance.'
        : `The player's cash balance was last updated ${candidate.facts.daysSinceUpdate} days ago.`;
    case 'chase_overdue_receivable':
      return `The prize receivable "${candidate.facts.label}" is ${candidate.facts.daysOverdue} days overdue, worth about ${Math.round(candidate.facts.amountHomeEstimate)} in home currency.`;
    case 'trim_weekly_overspend':
      return `This week's spending is over budget by about ${Math.round(candidate.facts.overAmount)} in home currency.`;
  }
}

export interface FinancialActionPrompt {
  system: string;
  user: string;
}

export function buildFinancialActionPrompt(candidate: ActionCandidate): FinancialActionPrompt {
  const lines = [
    describeFacts(candidate),
    `Estimated runway effect: about ${candidate.effectWeeks.toFixed(1)} weeks.`,
  ];
  return { system: SYSTEM_PROMPT, user: lines.join('\n') };
}

export function buildCorrectiveFinancialActionPrompt(
  candidate: ActionCandidate,
  validationError: string,
): FinancialActionPrompt {
  const base = buildFinancialActionPrompt(candidate);
  return {
    system: base.system,
    user: `${base.user}\n\nYour previous answer did not match the required schema: ${validationError}\nCall the tool again, correcting the problem.`,
  };
}
