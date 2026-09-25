import type { NoteCtx } from '@deucex/db';

// Bump whenever the prompt's instructions change in a way that could shift
// the model's output distribution; agent_runs.prompt_version records this
// per run (TECH-ARCHITECTURE.md section 3).
export const EXTRACTION_PROMPT_VERSION = 'v1';
// Bump alongside schema.ts's buildExtractionModelOutputSchema whenever a
// field is added, removed or its meaning changes.
export const EXTRACTION_SCHEMA_VERSION = 'v1';

export interface ExtractionPromptInput {
  ctx: NoteCtx;
  transcript: string;
  tagVocabulary: readonly string[];
}

const SYSTEM_PROMPT = `You read a tennis player's own spoken note, already transcribed, and propose structured fields for the player to confirm or correct before anything else reads the note (PRD-02).

Never invent a fact that is not in the transcript: leave a field null rather than guess.
Only use tags from the vocabulary you are given below; never invent a new one.
Result grammar, only when the note is about a Match: "W" or "L", then each set as "d-d" with an optional tiebreak in parentheses, for example "L 6-4 3-6 6-7(5)". Leave result and opponent null for a Practice, Travel or Other note, or when the transcript does not give a clear result.
Mood: pick the closest of frustrated, flat, confident or energised even when you are not sure, and report your own confidence in that guess honestly from 0 to 1 — the caller decides whether that is confident enough to show the player, not you.
Summary: at most 220 characters, one line a coach could read to know what happened. Never mention money, injuries in clinical terms, or anything not said in the transcript.

Respond only by calling the recording tool with your answer.`;

function userPrompt(input: ExtractionPromptInput): string {
  return `Context: ${input.ctx}\nTranscript:\n"""\n${input.transcript}\n"""`;
}

export interface ExtractionPrompt {
  system: string;
  user: string;
}

export function buildExtractionPrompt(input: ExtractionPromptInput): ExtractionPrompt {
  return {
    system: `${SYSTEM_PROMPT}\n\nTag vocabulary: ${input.tagVocabulary.join(', ')}`,
    user: userPrompt(input),
  };
}

// PRD-02 section 7: "A response that fails validation is retried once with
// the errors appended to the prompt."
export function buildCorrectiveExtractionPrompt(
  input: ExtractionPromptInput,
  validationError: string,
): ExtractionPrompt {
  const base = buildExtractionPrompt(input);
  return {
    system: base.system,
    user: `${base.user}\n\nYour previous answer did not match the required schema: ${validationError}\nCall the tool again, correcting the problem.`,
  };
}
