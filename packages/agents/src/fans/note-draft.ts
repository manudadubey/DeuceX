import { z } from 'zod';
import { AgentValidationError, type TokenUsage } from '@procircuit/actions';
import type { PatronNoteKind } from './types';

// P-10: one drafted note per flagged patron, in the player's voice, that the
// player edits and sends. Owner decision (step 4.1): a small Fans-owned
// drafting call now rather than templates, with PRD-05's voice profile
// swapped in once the Content Agent exists (step 4.2). One schema-constrained
// call, one corrective retry, the same shape as financial/generate-action.ts.
//
// The opening line is deterministic, not the model's: P-AC-5 and P-AC-8 pin
// exact wording ("Anna, I noticed you moved on last month"; a nudge that says
// Stripe retries on Friday), and PRD-04 section 7's rules (never runway,
// never other patrons' names, never payment amounts) are checked in code
// after the call, not just asked for in the prompt.

export const PATRON_NOTE_MODEL = 'gpt-4o-mini';
export const PATRON_NOTE_PROMPT_VERSION = 'v1';
export const PATRON_NOTE_SCHEMA_VERSION = 'v1';

export const patronNoteModelOutputSchema = z.object({
  text: z.string().min(20).max(700),
});

export interface PatronNoteInput {
  kind: PatronNoteKind;
  playerFirstName: string;
  patronFirstName: string;
  tierName: string;
  tenureMonths: number;
  /** thanks: "last month", "this month" or "a while back". */
  leftWhen?: string;
  /** nudge: the weekday Stripe retries, e.g. "Friday". */
  retryDay?: string;
  /** Every other patron's first name, which the draft must never mention. */
  otherPatronFirstNames: readonly string[];
}

export interface PatronNotePrompt {
  system: string;
  user: string;
}

export interface PatronNoteModelClient {
  complete(prompt: PatronNotePrompt): Promise<{ raw: unknown; usage: TokenUsage }>;
}

export class PatronNoteModelCallError extends Error {}

/** The deterministic first sentence the draft must start with. */
export function patronNoteOpening(input: PatronNoteInput): string {
  const first = input.patronFirstName;
  switch (input.kind) {
    case 'thanks':
      return `${first}, I noticed you moved on ${input.leftWhen ?? 'recently'}.`;
    case 'nudge':
      return `${first}, quick one: Stripe says your card didn't go through this week. No rush at all, it'll retry on ${input.retryDay ?? 'Friday'}.`;
    case 'checkin':
      return `${first}, just checking in.`;
    case 'welcome':
      return `${first}, welcome, and thank you.`;
  }
}

/** "last month" / "this month" / "a while back" relative to now. */
export function leftWhenPhrase(leftAtIso: string, now: Date): string {
  const left = new Date(leftAtIso);
  const monthsAgo =
    (now.getUTCFullYear() - left.getUTCFullYear()) * 12 + (now.getUTCMonth() - left.getUTCMonth());
  if (monthsAgo <= 0) return 'this month';
  if (monthsAgo === 1) return 'last month';
  return 'a while back';
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayName(iso: string): string {
  return WEEKDAYS[new Date(iso).getUTCDay()]!;
}

const KIND_BRIEF: Record<PatronNoteKind, string> = {
  thanks:
    'They have stopped backing the player. Thank them warmly for the time they did, make clear the door is open, and do not ask why they left.',
  nudge:
    'Their card payment failed and Stripe will retry. Keep it light and unembarrassing; do not ask them to do anything urgently.',
  checkin:
    'They have not opened the last few updates. Ask, lightly, whether there is something they would rather hear about. No guilt.',
  welcome:
    'They have just started backing the player. Thank them and say what is coming next in general terms.',
};

const SYSTEM_PROMPT = `You draft a short personal email from a professional tennis player to one of their patrons (people who pay a monthly amount to follow the player's season).
Write in the first person, as the player. Australian English. Warm, direct, plain; no exclamation marks, no hashtags, no emoji.
Never use an em dash; use commas, colons, parentheses, en dashes or a new sentence.
Never mention money amounts, prices, fees, currencies, runway, finances, or any other patron by name.
Two to four sentences in total. The text MUST begin with the exact opening sentence given, unchanged, followed by your own sentences.
Respond only with the JSON object requested.`;

export function buildPatronNotePrompt(input: PatronNoteInput): PatronNotePrompt {
  const lines = [
    `Player's first name: ${input.playerFirstName}`,
    `Patron's first name: ${input.patronFirstName}`,
    `Tier: ${input.tierName}`,
    `Months as a patron: ${input.tenureMonths}`,
    `Situation: ${KIND_BRIEF[input.kind]}`,
    `Opening sentence (use exactly): ${patronNoteOpening(input)}`,
  ];
  return { system: SYSTEM_PROMPT, user: lines.join('\n') };
}

function buildCorrectivePrompt(input: PatronNoteInput, problem: string): PatronNotePrompt {
  const base = buildPatronNotePrompt(input);
  return {
    system: base.system,
    user: `${base.user}\n\nYour previous answer was not usable: ${problem}\nAnswer again, fixing the problem.`,
  };
}

/**
 * PRD-04 section 7's content rules, checked in code. Returns the first
 * problem found, or null when the draft is usable.
 */
export function checkPatronNote(text: string, input: PatronNoteInput): string | null {
  if (!text.startsWith(patronNoteOpening(input))) {
    return 'it does not begin with the exact opening sentence';
  }
  if (text.includes('—')) return 'it contains an em dash';
  if (/[$€£¥]|\b(AUD|USD|EUR|CNY|GBP)\b|\d+\s?(dollars|euros)\b/i.test(text)) {
    return 'it mentions a money amount or currency';
  }
  if (/\brunway\b/i.test(text)) return 'it mentions runway';
  for (const name of input.otherPatronFirstNames) {
    if (
      name.length > 1 &&
      name !== input.patronFirstName &&
      new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text)
    ) {
      return `it mentions another patron (${name})`;
    }
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validate(raw: unknown, input: PatronNoteInput): { text: string } | { problem: string } {
  const parsed = patronNoteModelOutputSchema.safeParse(raw);
  if (!parsed.success) return { problem: parsed.error.message };
  const text = parsed.data.text.trim();
  const problem = checkPatronNote(text, input);
  return problem ? { problem } : { text };
}

export interface GeneratePatronNoteResult {
  text: string;
  usage: TokenUsage;
}

/** Wrapped in recordRun() by the caller (apps/api/src/fans), same as every other agent call. */
export async function generatePatronNote(
  client: PatronNoteModelClient,
  input: PatronNoteInput,
): Promise<GeneratePatronNoteResult> {
  const first = await client.complete(buildPatronNotePrompt(input));
  const firstResult = validate(first.raw, input);
  if ('text' in firstResult) return { text: firstResult.text, usage: first.usage };

  const second = await client.complete(buildCorrectivePrompt(input, firstResult.problem));
  const usage: TokenUsage = {
    inputTokens: first.usage.inputTokens + second.usage.inputTokens,
    outputTokens: first.usage.outputTokens + second.usage.outputTokens,
  };
  const secondResult = validate(second.raw, input);
  if ('text' in secondResult) return { text: secondResult.text, usage };

  throw new AgentValidationError(
    `fans/patron-note: draft failed validation twice: ${secondResult.problem}`,
  );
}

// ---------------------------------------------------------------------------
// Clients: a plain fetch against the vendor's REST API (same shape as
// financial/model-client.ts), and a mock for tests and the dev fallback.
// ---------------------------------------------------------------------------

const NOTE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { text: { type: 'string' } },
  required: ['text'],
} as const;

interface OpenAIChatCompletionResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export function createOpenAIPatronNoteClient(config: {
  apiKey: string;
  model: string;
}): PatronNoteModelClient {
  return {
    async complete({ system, user }) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 300,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'patron_note', strict: true, schema: NOTE_JSON_SCHEMA },
          },
        }),
      });
      if (!response.ok) {
        throw new PatronNoteModelCallError(
          `Patron note model call failed: ${response.status} ${await response.text()}`,
        );
      }
      const body = (await response.json()) as OpenAIChatCompletionResponse;
      const content = body.choices[0]?.message.content;
      if (!content) throw new PatronNoteModelCallError('Patron note model response had no content');
      return {
        raw: JSON.parse(content),
        usage: {
          inputTokens: body.usage.prompt_tokens,
          outputTokens: body.usage.completion_tokens,
        },
      };
    },
  };
}

/**
 * Echoes the required opening plus one fixed sentence, so the mock always
 * passes checkPatronNote. Used in tests and as apps/api's fallback when
 * OPENAI_API_KEY is unset.
 */
export function createMockPatronNoteClient(
  tail = 'It meant a lot to have you along for the season.',
): PatronNoteModelClient {
  return {
    async complete({ user }) {
      const opening = /Opening sentence \(use exactly\): (.*)$/m.exec(user)?.[1] ?? '';
      return {
        raw: { text: `${opening} ${tail}` },
        usage: { inputTokens: 220, outputTokens: 60 },
      };
    },
  };
}
