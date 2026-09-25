import { z } from 'zod';
import { AgentValidationError, type TokenUsage } from '@deucex/actions';
import type { NamedPerson } from './checks';
import { paragraphs, sentences as sentencesOf, wordCount } from './text';

// PRD-05 section 3: one schema-constrained call over a pre-assembled input
// bundle (TECH-ARCHITECTURE.md section 3a), one corrective retry, then the
// "Write it yourself" failure path (C-AC-11). The model is gpt-4o (owner
// decision, step 4.2: the one voice-sensitive text in the product); rewrites
// run on gpt-4o-mini (rewrite.ts).
//
// What the prompt asks for and what is enforced in code after the call are
// kept apart on purpose, like fans/note-draft.ts: the word range (the build
// plan's "150 to 250 words"), the result and score first (C-3), no em dash
// (the copy rule), no exclamation marks unless the player's own past updates
// use them (C-2) are all validated here, so a model that ignores the prompt
// gets one corrective retry and then fails loudly rather than shipping.

export const CONTENT_DRAFT_MODEL = 'gpt-4o';
export const CONTENT_DRAFT_PROMPT_VERSION = 'v1';
export const CONTENT_DRAFT_SCHEMA_VERSION = 'v1';

export const DRAFT_MIN_WORDS = 150;
export const DRAFT_MAX_WORDS = 250;
export const PRACTICE_SECTION_MAX_WORDS = 110;

const PERSON_ROLES = ['coach', 'physio', 'doctor', 'team', 'family', 'other'] as const;

export const contentDraftModelOutputSchema = z.object({
  subject: z.string().min(3).max(80),
  altSubjects: z.array(z.string().min(3).max(80)).length(2),
  paragraphs: z.array(z.string().min(1)).min(2).max(6),
  practiceSection: z.string().nullable(),
  people: z.array(z.object({ name: z.string().min(1), role: z.enum(PERSON_ROLES) })),
});

export type ContentDraftModelOutput = z.infer<typeof contentDraftModelOutputSchema>;

export interface DraftNote {
  id: string;
  ctx: string;
  recordedAt: string;
  transcript: string;
  result: string | null;
  opponent: string | null;
  round: string | null;
  surface: string | null;
  mood: string | null;
  tags: string[];
}

export interface VoiceExample {
  subject: string;
  body: string;
}

export interface ContentDraftInput {
  /** ISO 639-1, players.patron_language (one language in Release 1, worksheet 9). */
  lang: string;
  playerFirstName: string;
  /** The triggering note; null for a manual "New update" with no fresh note (C-20). */
  note: DraftNote | null;
  /** The two notes before the trigger, or the last three for a manual draft. */
  earlierNotes: DraftNote[];
  /** The voice profile's examples: the best-opened past updates, up to three. */
  examples: VoiceExample[];
  /** Whether any selected-by-default tier gets the practice-notes section (C-9). */
  wantsPracticeSection: boolean;
  /** Names the player keeps private (players.content_private_names). */
  privateNames: string[];
  nextDeadline: string | null;
  /** Notes a published update has already covered, so a new draft finds a new angle rather than repeating it. */
  coveredNoteIds?: string[];
}

export interface ContentPrompt {
  system: string;
  user: string;
}

export interface ContentDraftModelClient {
  complete(prompt: ContentPrompt): Promise<{ raw: unknown; usage: TokenUsage }>;
}

export class ContentModelCallError extends Error {}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'Australian English',
  de: 'German',
  es: 'Spanish',
  zh: 'Simplified Chinese',
};

export function languageName(lang: string): string {
  return LANGUAGE_NAMES[lang] ?? 'Australian English';
}

function usesExclamations(examples: readonly VoiceExample[]): boolean {
  return examples.some((e) => e.body.includes('!'));
}

function systemPrompt(input: ContentDraftInput): string {
  const bangs = usesExclamations(input.examples)
    ? 'Exclamation marks only as sparingly as the example updates use them.'
    : 'No exclamation marks.';
  return `You write a patron update for a professional tennis player ranked outside the top 100. Patrons pay a monthly amount to follow the player's season; this email is what they get in return.
Write in ${languageName(input.lang)}, in the first person, as the player, in the player's own voice: match the example updates when given, otherwise the way the player talks in their notes. Plain, honest, specific. ${bangs} No hashtags, no emoji, no marketing language.
Never use an em dash; use commas, colons, parentheses, en dashes or a new sentence.
Open with the result and score in the first sentence when there is a result. Never call a loss acceptable or good except through the player's own reasoning in the note.
Invent nothing: every fact must come from the notes given. If something is not in the notes, leave it out.
The example updates show the player's tone only. Never copy their sentences or retell what they already told patrons; a note marked as already written up needs a new angle, or a brief mention at most.
Never mention money figures, prize money amounts, runway, reserves, budgets, injuries, treatment, physios or doctors. Never name the player's coach or anyone from their team; say "my coach" instead. Say nothing about the opponent's game beyond the result; name them plainly.
The body is ${DRAFT_MIN_WORDS} to ${DRAFT_MAX_WORDS} words in 3 to 5 short paragraphs.
The subject is short and specific (under 60 characters, no quote marks), with two genuinely different alternatives.
practiceSection is a short extra paragraph (under ${PRACTICE_SECTION_MAX_WORDS} words) about what the player is working on in practice, for the higher patron tiers, drawn only from the notes; null when the notes give nothing to say or it is not asked for.
people lists every person named in the notes with their role (coach, physio, doctor, team, family or other). Do not include the opponent.
Respond only with the JSON object requested.`;
}

function describeNote(note: DraftNote, label: string, covered = false): string {
  const facts = [
    `${label} (${note.ctx}, recorded ${note.recordedAt.slice(0, 10)})${covered ? ' · already written up for patrons' : ''}`,
    note.result ? `Result: ${note.result}` : null,
    note.opponent ? `Opponent: ${note.opponent}` : null,
    note.round ? `Round: ${note.round}` : null,
    note.surface ? `Surface: ${note.surface}` : null,
    note.mood ? `Mood: ${note.mood}` : null,
    note.tags.length ? `Tags: ${note.tags.join(', ')}` : null,
    `What the player said: """${note.transcript.trim()}"""`,
  ];
  return facts.filter(Boolean).join('\n');
}

export function buildContentDraftPrompt(input: ContentDraftInput): ContentPrompt {
  const parts: string[] = [`Player's first name: ${input.playerFirstName}`];
  if (input.note) {
    parts.push(describeNote(input.note, 'The note this update is about'));
  } else {
    parts.push(
      'There is no fresh note. Suggest an angle from the recent notes below and write the update around it.',
    );
  }
  const covered = new Set(input.coveredNoteIds ?? []);
  input.earlierNotes.forEach((n, i) =>
    parts.push(describeNote(n, `Earlier note ${i + 1}`, covered.has(n.id))),
  );
  if (input.examples.length) {
    parts.push(
      "Past updates in the player's voice (match their tone and sentence length):\n" +
        input.examples
          .map((e, i) => `Example ${i + 1}, subject "${e.subject}":\n${e.body}`)
          .join('\n\n'),
    );
  }
  if (input.privateNames.length) {
    parts.push(`Names the player never uses in updates: ${input.privateNames.join(', ')}`);
  }
  if (input.nextDeadline) parts.push(`Next tournament deadline: ${input.nextDeadline}`);
  parts.push(
    input.wantsPracticeSection
      ? 'Write a practiceSection if the notes support one.'
      : 'Set practiceSection to null.',
  );
  return { system: systemPrompt(input), user: parts.join('\n\n') };
}

function correctivePrompt(input: ContentDraftInput, problem: string): ContentPrompt {
  const base = buildContentDraftPrompt(input);
  return {
    system: base.system,
    user: `${base.user}\n\nYour previous answer was not usable: ${problem}\nAnswer again, fixing the problem.`,
  };
}

/** The set scores of a result, e.g. "L 6-4 3-6 6-7(5)" -> ["6-4", "3-6", "6-7"]. */
export function setScores(result: string): string[] {
  return result.match(/\d+-\d+/g) ?? [];
}

function normaliseDashes(text: string): string {
  return text.replace(/[–‑]/g, '-');
}

export interface ValidatedDraft {
  subject: string;
  altSubjects: [string, string];
  body: string;
  practiceSection: string | null;
  people: NamedPerson[];
}

function normaliseSentence(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when a quarter or more of the draft's sentences appear verbatim in one
 * example. The examples are for tone; found live in step 4.2, a manual draft
 * with no fresh note copied the one published update word for word.
 */
export function copiesAnExample(body: string, examples: readonly VoiceExample[]): boolean {
  const draft = sentencesOf(body)
    .map(normaliseSentence)
    .filter((s) => s.split(' ').length >= 5);
  if (draft.length === 0) return false;
  return examples.some((e) => {
    const seen = new Set(sentencesOf(e.body).map(normaliseSentence));
    return draft.filter((s) => seen.has(s)).length / draft.length >= 0.25;
  });
}

/** Returns the first problem with a model output, or null when it is usable. */
export function checkDraftOutput(
  out: ContentDraftModelOutput,
  input: ContentDraftInput,
): string | null {
  const body = out.paragraphs.map((p) => p.trim()).join('\n\n');
  const words = wordCount(body);
  if (words < DRAFT_MIN_WORDS || words > DRAFT_MAX_WORDS) {
    return `the body is ${words} words; it must be ${DRAFT_MIN_WORDS} to ${DRAFT_MAX_WORDS}`;
  }
  const everything = [out.subject, ...out.altSubjects, body, out.practiceSection ?? ''].join('\n');
  if (everything.includes('—')) return 'it contains an em dash';
  if (!usesExclamations(input.examples) && everything.includes('!')) {
    return 'it uses an exclamation mark';
  }
  if (input.note?.result) {
    const first = normaliseDashes(paragraphs(body)[0] ?? '');
    const missing = setScores(input.note.result).filter((s) => !first.includes(s));
    if (missing.length > 0) {
      return `the first paragraph must state the result and full score (${input.note.result})`;
    }
  }
  if (copiesAnExample(body, input.examples)) {
    return 'it repeats sentences from a past update; write something new in the same voice';
  }
  if (out.practiceSection && wordCount(out.practiceSection) > PRACTICE_SECTION_MAX_WORDS) {
    return `practiceSection is over ${PRACTICE_SECTION_MAX_WORDS} words`;
  }
  return null;
}

function validate(
  raw: unknown,
  input: ContentDraftInput,
): { draft: ValidatedDraft } | { problem: string } {
  const parsed = contentDraftModelOutputSchema.safeParse(raw);
  if (!parsed.success) return { problem: parsed.error.message };
  const problem = checkDraftOutput(parsed.data, input);
  if (problem) return { problem };
  const out = parsed.data;
  return {
    draft: {
      subject: out.subject.trim(),
      altSubjects: [out.altSubjects[0]!.trim(), out.altSubjects[1]!.trim()],
      body: out.paragraphs.map((p) => p.trim()).join('\n\n'),
      practiceSection: out.practiceSection?.trim() || null,
      people: out.people.filter(
        (p) => !input.note?.opponent || p.name.trim() !== input.note.opponent.trim(),
      ),
    },
  };
}

export interface GenerateContentDraftResult {
  draft: ValidatedDraft;
  usage: TokenUsage;
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/** Wrapped in recordRun() by the caller (apps/api/src/content), same as every other agent call. */
export async function generateContentDraft(
  client: ContentDraftModelClient,
  input: ContentDraftInput,
): Promise<GenerateContentDraftResult> {
  const first = await client.complete(buildContentDraftPrompt(input));
  const firstResult = validate(first.raw, input);
  if ('draft' in firstResult) return { draft: firstResult.draft, usage: first.usage };

  const second = await client.complete(correctivePrompt(input, firstResult.problem));
  const usage = addUsage(first.usage, second.usage);
  const secondResult = validate(second.raw, input);
  if ('draft' in secondResult) return { draft: secondResult.draft, usage };

  throw new AgentValidationError(
    `content/draft: output failed validation twice: ${secondResult.problem}`,
  );
}

// ---------------------------------------------------------------------------
// Clients: a plain fetch against the vendor's REST API (same shape as the
// other agents' model clients), and a mock for tests and the dev fallback.
// ---------------------------------------------------------------------------

export const DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    subject: { type: 'string' },
    altSubjects: { type: 'array', items: { type: 'string' } },
    paragraphs: { type: 'array', items: { type: 'string' } },
    practiceSection: { type: ['string', 'null'] },
    people: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          role: { type: 'string', enum: [...PERSON_ROLES] },
        },
        required: ['name', 'role'],
      },
    },
  },
  required: ['subject', 'altSubjects', 'paragraphs', 'practiceSection', 'people'],
} as const;

interface OpenAIChatCompletionResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

/** Shared by the draft and rewrite clients: one strict JSON-schema chat completion. */
export function createOpenAIJsonClient(config: {
  apiKey: string;
  model: string;
  schemaName: string;
  schema: object;
  maxTokens: number;
}): ContentDraftModelClient {
  return {
    async complete({ system, user }) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens,
          temperature: 0.7,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: config.schemaName, strict: true, schema: config.schema },
          },
        }),
      });
      if (!response.ok) {
        throw new ContentModelCallError(
          `Content model call failed: ${response.status} ${await response.text()}`,
        );
      }
      const body = (await response.json()) as OpenAIChatCompletionResponse;
      const content = body.choices[0]?.message.content;
      if (!content) throw new ContentModelCallError('Content model response had no content');
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

export function createOpenAIContentDraftClient(config: {
  apiKey: string;
  model?: string;
}): ContentDraftModelClient {
  return createOpenAIJsonClient({
    apiKey: config.apiKey,
    model: config.model ?? CONTENT_DRAFT_MODEL,
    schemaName: 'patron_update_draft',
    schema: DRAFT_JSON_SCHEMA,
    maxTokens: 900,
  });
}

/**
 * A deterministic draft that always passes checkDraftOutput: it reads the
 * result and opponent back out of the prompt. Used in tests and as apps/api's
 * fallback when OPENAI_API_KEY is unset.
 */
export function createMockContentDraftClient(): ContentDraftModelClient {
  return {
    async complete({ user }) {
      const result = /^Result: (.*)$/m.exec(user)?.[1] ?? null;
      const opponent = /^Opponent: (.*)$/m.exec(user)?.[1] ?? 'my opponent';
      const scores = result ? setScores(result).join(' ') : '';
      const won = result?.startsWith('W');
      const opening = result
        ? `I ${won ? 'beat' : 'lost to'} ${opponent} ${scores} yesterday, and I want to tell you how it actually went rather than how the score looks.`
        : 'No match this week, so this one is about the work in between, which is most of what a season actually is.';
      const paragraphsOut = [
        opening,
        'The first set was the cleanest tennis I have played in a while. I served to a plan, stayed patient in the long rallies and made the other side of the net do the work. That part I am keeping.',
        'After that it got harder, and I got tighter than I would like. I rushed a couple of points I should have built, and at this level a couple of points is the whole match. I know exactly which ones, and I have written them down so I stop repeating them.',
        'Next is a few days of practice with my coach before the next event. The plan is simple: more second serves under pressure, fewer free points given away, and the same patience I had early on.',
        'Thank you for being here for the weeks that do not make any highlight reel. It genuinely helps to know someone is reading.',
      ];
      const wantsPractice = /Write a practiceSection/.test(user);
      return {
        raw: {
          subject: result
            ? won
              ? 'A win built on patience'
              : 'Close, and a clear lesson'
            : 'The work between matches',
          altSubjects: ['What the score does not say', 'Back on the practice court'],
          paragraphs: paragraphsOut,
          practiceSection: wantsPractice
            ? 'For the practice notes: this week is second serves under pressure, twenty minutes a day with a scoreboard running so every ball counts.'
            : null,
          people: [],
        },
        usage: { inputTokens: 1400, outputTokens: 420 },
      };
    },
  };
}
