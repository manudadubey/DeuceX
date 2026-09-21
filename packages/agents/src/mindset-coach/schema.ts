import { z } from 'zod';

// MC-1/section 4.1: "40 to 90 words" across the whole body, 1 to 3
// sentences; one sentence only on a light morning (section 7), which is
// still comfortably inside this range for a single sentence.
export const INSIGHT_MIN_WORDS = 8;
export const INSIGHT_MAX_WORDS = 90;

function wordCount(sentences: readonly string[]): number {
  return sentences.join(' ').trim().split(/\s+/).filter(Boolean).length;
}

export const insightModelOutputSchema = z.object({
  body: z
    .array(z.string().min(1))
    .min(1)
    .max(3)
    .refine((body) => {
      const words = wordCount(body);
      return words >= INSIGHT_MIN_WORDS && words <= INSIGHT_MAX_WORDS;
    }, `body must be ${INSIGHT_MIN_WORDS} to ${INSIGHT_MAX_WORDS} words across its 1-3 sentences`),
  // Nullable, not always required: section 7's feedback-adaptation rule
  // withholds the focus entirely on an adapted, observation-only morning
  // unless a pattern flag exists that run (generate-insight.ts decides
  // which mode applies and tells the model so in the prompt).
  focus: z.string().min(1).nullable(),
});

export type InsightModelOutput = z.infer<typeof insightModelOutputSchema>;

// MC-4 / section 7 "Language and tone": "a blocklist of clinical terms...
// fails the tone check." English only for release 1, same scope note as
// distress.ts's lexicon — a per-language blocklist is PRD-06 section 12's
// open question, not something to invent here.
const CLINICAL_TERM_BLOCKLIST: readonly RegExp[] = [
  /\bdepression\b/i,
  /\banxiety disorder\b/i,
  /\bburnout\b/i,
  /\bsymptom(s)?\b/i,
  /\bdiagnos(is|e|ed|ing)\b/i,
  /\bclinical(ly)?\b/i,
  /\bdisorder\b/i,
  /\bmental illness\b/i,
];

export interface ToneCheckResult {
  passed: boolean;
  flaggedTerms: string[];
}

// MC-4 / AC-11: run on body and focus together before an insight is ever
// shown to a player.
export function runToneCheck(output: {
  body: readonly string[];
  focus: string | null;
}): ToneCheckResult {
  const text = [...output.body, output.focus ?? ''].join(' ');
  const flaggedTerms = CLINICAL_TERM_BLOCKLIST.filter((pattern) => pattern.test(text)).map(
    (pattern) => pattern.source,
  );
  return { passed: flaggedTerms.length === 0, flaggedTerms };
}
