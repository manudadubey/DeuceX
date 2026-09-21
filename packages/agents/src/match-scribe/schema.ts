import { z } from 'zod';
import type { NoteCtx, NoteMood, NoteRound } from '@procircuit/db';

// PRD-02 section 7: "Result grammar: W or L, then sets as d-d with an
// optional tiebreak in parentheses, for example 'L 6-4 3-6 6-7(5)'."
export const RESULT_GRAMMAR = /^[WL](?: \d+-\d+(?:\(\d+\))?)+$/;

const CTX_VALUES = ['match', 'practice', 'travel', 'other'] as const;
const ROUND_VALUES = ['Q1', 'Q2', 'Q3', 'R1', 'R2', 'R3', 'QF', 'SF', 'F'] as const;
const MOOD_VALUES = ['frustrated', 'flat', 'confident', 'energised'] as const;

// PRD-02 section 7: "made only when the extractor's self-reported confidence
// is at least 0.6 (placeholder, section 12)" — the same placeholder the
// decisions worksheet lists as needing review against real transcripts, not
// a number to treat as final.
export const MOOD_PROPOSAL_CONFIDENCE_THRESHOLD = 0.6;

export const EXTRACTION_MAX_SUMMARY_LENGTH = 220;

// A versioned schema (PRD-02 section 7's "Zod-style, version 1"), built per
// call because the tag vocabulary it validates against is per-player, not
// static — see @procircuit/agents/match-scribe's caller, which unions
// INITIAL_TAG_VOCABULARY with tags the player has already used.
export function buildExtractionModelOutputSchema(tagVocabulary: readonly string[]) {
  const vocabulary = new Set(tagVocabulary);
  return z.object({
    ctx: z.enum(CTX_VALUES),
    result: z.string().regex(RESULT_GRAMMAR, 'result must read like "L 6-4 3-6 6-7(5)"').nullable(),
    opponent: z.string().min(1).nullable(),
    round: z.enum(ROUND_VALUES).nullable(),
    surface: z.string().min(1).nullable(),
    tags: z.array(z.string()).refine((tags) => tags.every((tag) => vocabulary.has(tag)), {
      message: "every tag must be in the player's vocabulary",
    }),
    // The model always proposes a mood and reports its own confidence in
    // it; whether that clears the bar to actually show the player is a
    // merge-time decision (buildProposal below), not a schema failure.
    mood: z.enum(MOOD_VALUES),
    moodConfidence: z.number().min(0).max(1),
    summary: z.string().max(EXTRACTION_MAX_SUMMARY_LENGTH),
  });
}

export type ExtractionModelOutput = z.infer<ReturnType<typeof buildExtractionModelOutputSchema>>;

export interface MatchScribeProposal {
  ctx: NoteCtx;
  result: string | null;
  opponent: string | null;
  round: NoteRound | null;
  surface: string | null;
  tags: string[];
  mood: NoteMood | null;
  summary: string;
  // PRD-08's conditions stamp is a named field in this agent's schema per
  // the build plan (step 1.2), but PRD-08 and the Tournament Agent's
  // "current Entered event" input don't exist until step 3.1/3.3 — this
  // agent never populates it, the same "saves without one, backfilled
  // later" fallback step 1.1's `cond` column already anticipates.
  conditions: string[] | null;
}

// Builds the proposal the player sees in review (S-8) from a validated
// model output: result/opponent/round/surface only ever apply to Match
// notes (S-3) regardless of what the model returned, and mood is only
// proposed above the confidence floor (section 7).
export function buildProposal(
  output: ExtractionModelOutput,
  input: { ctx: NoteCtx },
): MatchScribeProposal {
  const isMatch = input.ctx === 'match';
  return {
    ctx: input.ctx,
    result: isMatch ? output.result : null,
    opponent: isMatch ? output.opponent : null,
    round: isMatch ? output.round : null,
    surface: isMatch ? output.surface : null,
    tags: output.tags,
    mood: output.moodConfidence >= MOOD_PROPOSAL_CONFIDENCE_THRESHOLD ? output.mood : null,
    summary: output.summary,
    conditions: null,
  };
}
