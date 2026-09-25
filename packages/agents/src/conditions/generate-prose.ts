import { AgentValidationError, type TokenUsage } from '@deucex/actions';
import { buildCorrectiveProsePrompt, buildProsePrompt, type ProseBriefInput } from './prose-prompt';
import type { ProseModelClient } from './prose-model-client';
import { proseOutputSchema, validateProseCoverage, type ProseModelOutput } from './prose-schema';

export const PROSE_MODEL = 'gpt-4o-mini';

export interface GenerateProseResult {
  output: ProseModelOutput;
  usage: TokenUsage;
}

function sumUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

// One schema-constrained batch call (up to MAX_BRIEFS_PER_PROSE_CALL briefs)
// with exactly one corrective retry on a validation failure — the same
// shape as match-scribe/extract.ts's extractMatchNote, meant to be wrapped
// in packages/actions' recordRun() by the caller so both attempts land on a
// single agent_runs row.
export async function generateConditionsProse(
  client: ProseModelClient,
  briefs: readonly ProseBriefInput[],
): Promise<GenerateProseResult> {
  const expectedIds = briefs.map((b) => b.tournamentId);

  const first = await client.complete(buildProsePrompt(briefs));
  const firstParsed = proseOutputSchema.safeParse(first.raw);
  if (firstParsed.success && validateProseCoverage(firstParsed.data, expectedIds)) {
    return { output: firstParsed.data, usage: first.usage };
  }

  const errorMessage = firstParsed.success
    ? 'response did not cover exactly the requested tournamentIds'
    : firstParsed.error.message;
  const second = await client.complete(buildCorrectiveProsePrompt(briefs, errorMessage));
  const usage = sumUsage(first.usage, second.usage);
  const secondParsed = proseOutputSchema.safeParse(second.raw);
  if (secondParsed.success && validateProseCoverage(secondParsed.data, expectedIds)) {
    return { output: secondParsed.data, usage };
  }

  throw new AgentValidationError(
    `conditions/generate-prose: model output failed schema validation twice: ${
      secondParsed.success ? errorMessage : secondParsed.error.message
    }`,
  );
}
