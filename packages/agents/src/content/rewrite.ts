import { z } from 'zod';
import { AgentValidationError, type TokenUsage } from '@deucex/actions';
import {
  createOpenAIJsonClient,
  languageName,
  setScores,
  type ContentDraftModelClient,
  type ContentPrompt,
} from './draft';
import { averageSentenceWords } from './checks';
import { paragraphs, wordCount } from './text';

// PRD-05 C-5: Shorter, Warmer and More tactical rewrite the body on request;
// Restore original returns the generated text (no model call, the server
// keeps generated_body). The rewrite starts from the player's current text,
// edits included, so an edit is never silently thrown away. gpt-4o-mini: a
// rewrite is a transformation of text the player already has, not a fresh
// piece of writing, and PRD-05 section 3 targets under A$0.03 per rewrite.

export const CONTENT_REWRITE_MODEL = 'gpt-4o-mini';
export const CONTENT_REWRITE_PROMPT_VERSION = 'v1';

export type RewriteVariant = 'shorter' | 'warmer' | 'tactical';
export const REWRITE_VARIANTS: readonly RewriteVariant[] = ['shorter', 'warmer', 'tactical'];

const BRIEF: Record<RewriteVariant, string> = {
  shorter:
    'Make it about half as long (roughly 80 to 130 words). Keep the result, the one lesson and the thank-you; cut everything else.',
  warmer:
    'Make it warmer towards the patrons: more of how it felt and what their support means, without gushing. Keep roughly the same length.',
  tactical:
    'Make it more tactical: more about the patterns, choices and adjustments in the match, in plain words a club player follows. Keep roughly the same length.',
};

const BOUNDS: Record<RewriteVariant, [number, number]> = {
  shorter: [60, 140],
  warmer: [120, 280],
  tactical: [120, 280],
};

export const rewriteModelOutputSchema = z.object({
  paragraphs: z.array(z.string().min(1)).min(1).max(6),
});

export interface RewriteInput {
  variant: RewriteVariant;
  lang: string;
  body: string;
  /** The note's result, when there is one: the score must survive the rewrite (C-3). */
  result: string | null;
}

export function buildRewritePrompt(input: RewriteInput): ContentPrompt {
  const bangs = input.body.includes('!') ? '' : ' No exclamation marks.';
  return {
    system: `You rewrite a professional tennis player's patron update, keeping it in their own first-person voice and in ${languageName(input.lang)}. Keep every fact; add none.${bangs} Never use an em dash. Keep sentences about as long as the original's (about ${Math.round(averageSentenceWords(input.body))} words). If the original opens with the result and score, the rewrite must too. Never add money figures, injuries, or anyone's name that is not already there. Respond only with the JSON object requested.`,
    user: `${BRIEF[input.variant]}\n\nThe update:\n${input.body}`,
  };
}

function problemWith(raw: unknown, input: RewriteInput): { body: string } | { problem: string } {
  const parsed = rewriteModelOutputSchema.safeParse(raw);
  if (!parsed.success) return { problem: parsed.error.message };
  const body = parsed.data.paragraphs.map((p) => p.trim()).join('\n\n');
  const [min, max] = BOUNDS[input.variant];
  const words = wordCount(body);
  if (words < min || words > max)
    return { problem: `it is ${words} words; aim for ${min} to ${max}` };
  if (body.includes('—')) return { problem: 'it contains an em dash' };
  if (!input.body.includes('!') && body.includes('!'))
    return { problem: 'it uses an exclamation mark' };
  if (input.result) {
    const first = (paragraphs(body)[0] ?? '').replace(/[–‑]/g, '-');
    if (setScores(input.result).some((s) => !first.includes(s))) {
      return { problem: `the first paragraph must keep the full score (${input.result})` };
    }
  }
  return { body };
}

export async function rewriteContent(
  client: ContentDraftModelClient,
  input: RewriteInput,
): Promise<{ body: string; usage: TokenUsage }> {
  const prompt = buildRewritePrompt(input);
  const first = await client.complete(prompt);
  const r1 = problemWith(first.raw, input);
  if ('body' in r1) return { body: r1.body, usage: first.usage };
  const second = await client.complete({
    system: prompt.system,
    user: `${prompt.user}\n\nYour previous answer was not usable: ${r1.problem}\nAnswer again, fixing the problem.`,
  });
  const usage = {
    inputTokens: first.usage.inputTokens + second.usage.inputTokens,
    outputTokens: first.usage.outputTokens + second.usage.outputTokens,
  };
  const r2 = problemWith(second.raw, input);
  if ('body' in r2) return { body: r2.body, usage };
  throw new AgentValidationError(`content/rewrite: output failed validation twice: ${r2.problem}`);
}

const REWRITE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { paragraphs: { type: 'array', items: { type: 'string' } } },
  required: ['paragraphs'],
} as const;

export function createOpenAIContentRewriteClient(config: {
  apiKey: string;
  model?: string;
}): ContentDraftModelClient {
  return createOpenAIJsonClient({
    apiKey: config.apiKey,
    model: config.model ?? CONTENT_REWRITE_MODEL,
    schemaName: 'patron_update_rewrite',
    schema: REWRITE_JSON_SCHEMA,
    maxTokens: 700,
  });
}

/** Shorter keeps the first two and the last paragraphs; the others return the text unchanged. */
export function createMockContentRewriteClient(): ContentDraftModelClient {
  return {
    async complete({ user }) {
      const body = user.split('The update:\n')[1] ?? '';
      const paras = paragraphs(body);
      const shorter = /about half as long/.test(user);
      const out =
        shorter && paras.length > 3 ? [paras[0]!, paras[1]!, paras[paras.length - 1]!] : paras;
      return { raw: { paragraphs: out }, usage: { inputTokens: 500, outputTokens: 200 } };
    },
  };
}
