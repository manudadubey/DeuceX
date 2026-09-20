import { AgentValidationError, type TokenUsage } from '@procircuit/actions';
import type { NoteCtx } from '@procircuit/db';
import { buildCorrectiveExtractionPrompt, buildExtractionPrompt } from './prompt';
import {
  buildExtractionModelOutputSchema,
  buildProposal,
  type MatchScribeProposal,
} from './schema';
import type { ExtractionModelClient } from './model-client';

// The pricing table (packages/actions/src/pricing.ts) only prices Claude
// model names; recordRun() looks the run's cost up by this string.
export const EXTRACTION_MODEL = 'claude-sonnet-5';

export interface ExtractMatchNoteInput {
  ctx: NoteCtx;
  transcript: string;
  tagVocabulary: readonly string[];
}

export interface ExtractMatchNoteResult {
  output: MatchScribeProposal;
  usage: TokenUsage;
}

function sumUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

// The first agent (build plan step 1.2): one schema-constrained call with
// exactly one corrective retry on a validation failure (PRD-02 section 7),
// meant to be wrapped in packages/actions' recordRun() by the caller so
// both attempts land on a single agent_runs row — this function itself
// throws AgentValidationError on a second failure rather than writing
// anything, since recordRun is what maps that error to
// `agent_runs.status = 'failed_validation'` and writes the row.
export async function extractMatchNote(
  client: ExtractionModelClient,
  input: ExtractMatchNoteInput,
): Promise<ExtractMatchNoteResult> {
  const schema = buildExtractionModelOutputSchema(input.tagVocabulary);

  const first = await client.complete(buildExtractionPrompt(input));
  const firstParsed = schema.safeParse(first.raw);
  if (firstParsed.success) {
    return { output: buildProposal(firstParsed.data, input), usage: first.usage };
  }

  const second = await client.complete(
    buildCorrectiveExtractionPrompt(input, firstParsed.error.message),
  );
  const usage = sumUsage(first.usage, second.usage);
  const secondParsed = schema.safeParse(second.raw);
  if (secondParsed.success) {
    return { output: buildProposal(secondParsed.data, input), usage };
  }

  throw new AgentValidationError(
    `match-scribe/extract: model output failed schema validation twice: ${secondParsed.error.message}`,
  );
}
