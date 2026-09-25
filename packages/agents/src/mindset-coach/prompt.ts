import type { NoteCtx, NoteMood } from '@deucex/db';

// Bump on any instruction change that could shift the model's output
// distribution (TECH-ARCHITECTURE.md section 3, agent_runs.prompt_version).
export const INSIGHT_PROMPT_VERSION = 'v1';
export const INSIGHT_SCHEMA_VERSION = 'v1';

export interface InsightPromptNote {
  date: string;
  ctx: NoteCtx;
  mood: NoteMood | null;
  result: string | null;
  summary: string | null;
}

export interface InsightPromptCheckIn {
  date: string;
  value: number;
  sentence: string | null;
}

export interface InsightPromptInput {
  lang: string;
  notes: readonly InsightPromptNote[];
  checkins: readonly InsightPromptCheckIn[];
  /** The statement of a pattern that is new or strengthened this run, if any (section 3). */
  patternFlagStatement: string | null;
  /** MC-17: yesterday was Travel, or today's first check-in was <=2, or a note logged after 23:00 local. */
  light: boolean;
  /** Section 3: fewer than three notes in the 30-day window. */
  checkinsOnly: boolean;
  /** Section 7's feedback-adaptation rule: three "not today" in the last seven days. */
  adapted: boolean;
  /** Recent focuses, so the model doesn't repeat one verbatim. */
  recentFocuses: readonly string[];
}

const SYSTEM_PROMPT = `You are the Mindset Coach, reading a tennis player's own words back to them (PRD-06). "It's a coach, not a therapist, and it says so."

Write in the first language given below. Address the player directly, warmly, and never as a diagnosis or a category.
Cite only what is in the notes and check-ins given to you; never invent a fact, a date, or an opponent.
Never use clinical language: no "depression", "anxiety", "burnout", "symptom", "diagnosis", or any label for how the player is. Describe behaviour in their own words instead ("you write about rushing"), never in categories.
body: one to three sentences, 8 to 90 words total, one true observation drawn from the material below. On a light morning, exactly one short sentence.
focus: one imperative sentence naming today's single focus, grounded in the same material. Do not repeat a focus already used recently unless it's still clearly the right one restated freshly.
Never mention money, rankings, or anything not given to you below.
Respond only by calling the recording tool with your answer.`;

function formatNote(n: InsightPromptNote): string {
  const parts = [n.date, n.ctx];
  if (n.result) parts.push(`result ${n.result}`);
  if (n.mood) parts.push(`mood ${n.mood}`);
  if (n.summary) parts.push(`"${n.summary}"`);
  return `- ${parts.join(' · ')}`;
}

function formatCheckIn(c: InsightPromptCheckIn): string {
  return c.sentence ? `- ${c.date}: ${c.value}/5, "${c.sentence}"` : `- ${c.date}: ${c.value}/5`;
}

export interface InsightPrompt {
  system: string;
  user: string;
}

export function buildInsightPrompt(input: InsightPromptInput): InsightPrompt {
  const lines: string[] = [`Write for the player in language: ${input.lang}.`];

  if (input.checkinsOnly) {
    lines.push(
      'Fewer than three notes were recorded in the last 30 days: write from the check-ins only and say so plainly rather than reaching for a note-based observation.',
    );
  }
  if (input.light) {
    lines.push(
      'This is a light morning: exactly one sentence for body, and a rest- or routine-oriented focus.',
    );
  }
  if (input.adapted) {
    lines.push(
      'The player has said "not today" to three of the last seven mornings: keep this one short and observation-only.' +
        (input.patternFlagStatement
          ? ''
          : ' Return focus as null unless there is a real reason not to.'),
    );
  }
  if (input.patternFlagStatement) {
    lines.push(
      `A pattern was just newly identified or strengthened: "${input.patternFlagStatement}". You may reference it naturally, once, without naming it as a "pattern".`,
    );
  }
  if (input.recentFocuses.length > 0) {
    lines.push(`Recent focuses, for variety: ${input.recentFocuses.join('; ')}`);
  }

  lines.push('Notes from the last 30 days:');
  lines.push(input.notes.length > 0 ? input.notes.map(formatNote).join('\n') : '(none)');
  lines.push('Check-ins from the last 30 days:');
  lines.push(input.checkins.length > 0 ? input.checkins.map(formatCheckIn).join('\n') : '(none)');

  return { system: SYSTEM_PROMPT, user: lines.join('\n') };
}

export function buildCorrectiveInsightPrompt(
  input: InsightPromptInput,
  validationError: string,
): InsightPrompt {
  const base = buildInsightPrompt(input);
  return {
    system: base.system,
    user: `${base.user}\n\nYour previous answer did not match the required schema: ${validationError}\nCall the tool again, correcting the problem.`,
  };
}

// AC-11: a tone-check failure is regenerated once with the offending terms
// named, distinct from a schema corrective retry above.
export function buildToneRetryPrompt(
  input: InsightPromptInput,
  flaggedTerms: readonly string[],
): InsightPrompt {
  const base = buildInsightPrompt(input);
  return {
    system: base.system,
    user: `${base.user}\n\nYour previous answer used clinical language your instructions forbid (matched terms: ${flaggedTerms.join(', ')}). Rewrite it in the player's own words instead, with no clinical vocabulary at all.`,
  };
}
