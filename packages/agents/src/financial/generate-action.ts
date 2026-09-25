import { AgentValidationError, type TokenUsage } from '@deucex/actions';
import type { ActionCandidate } from './action-candidates';
import { buildCorrectiveFinancialActionPrompt, buildFinancialActionPrompt } from './prompt';
import { financialActionModelOutputSchema } from './schema';
import type { FinancialActionModelClient } from './model-client';

export interface GenerateFinancialActionResult {
  candidateKey: ActionCandidate['key'];
  effectWeeks: number;
  text: string;
  secondSentence: string | null;
  usage: TokenUsage;
}

// One schema-constrained call, one corrective retry (the same shape as
// match-scribe/extract.ts and mindset-coach's own model call): phrases the
// candidate action-candidates.ts already chose deterministically. Meant to
// be wrapped in packages/actions' recordRun() by the caller, same reasoning
// as extractMatchNote's own comment.
export async function generateFinancialAction(
  client: FinancialActionModelClient,
  candidate: ActionCandidate,
): Promise<GenerateFinancialActionResult> {
  const first = await client.complete(buildFinancialActionPrompt(candidate));
  const firstParsed = financialActionModelOutputSchema.safeParse(first.raw);
  if (firstParsed.success) {
    return {
      candidateKey: candidate.key,
      effectWeeks: candidate.effectWeeks,
      text: firstParsed.data.text,
      secondSentence: firstParsed.data.secondSentence,
      usage: first.usage,
    };
  }

  const second = await client.complete(
    buildCorrectiveFinancialActionPrompt(candidate, firstParsed.error.message),
  );
  const usage: TokenUsage = {
    inputTokens: first.usage.inputTokens + second.usage.inputTokens,
    outputTokens: first.usage.outputTokens + second.usage.outputTokens,
  };
  const secondParsed = financialActionModelOutputSchema.safeParse(second.raw);
  if (secondParsed.success) {
    return {
      candidateKey: candidate.key,
      effectWeeks: candidate.effectWeeks,
      text: secondParsed.data.text,
      secondSentence: secondParsed.data.secondSentence,
      usage,
    };
  }

  throw new AgentValidationError(
    `financial/generate-action: model output failed schema validation twice: ${secondParsed.error.message}`,
  );
}
