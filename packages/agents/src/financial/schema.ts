import { z } from 'zod';

export const FINANCIAL_ACTION_SCHEMA_VERSION = 'v1';

// PRD-03 F-18: "the action in bold" plus "an optional second sentence [that]
// carries no control." One short generation (TECH-ARCHITECTURE.md section 5:
// "the rest is arithmetic") to phrase the chosen candidate's facts in the
// player's own numbers, not to choose which candidate wins — that ranking
// is action-candidates.ts's deterministic job.
export const financialActionModelOutputSchema = z.object({
  text: z.string().min(1).max(140),
  secondSentence: z.string().max(140).nullable(),
});

export type FinancialActionModelOutput = z.infer<typeof financialActionModelOutputSchema>;
