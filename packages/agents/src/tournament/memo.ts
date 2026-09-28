import { z } from 'zod';
import { AgentValidationError, type TokenUsage } from '@deucex/actions';
import { modelFor } from '../models';
import type { ShortlistResult } from './types';

// PRD-01 T-15: the recommendation memo, generated once per run. The model is
// handed every figure already formatted, and validation rejects a memo that
// states a money amount, a points figure or a date the shortlist doesn't
// contain (T-AC-14: "every number in the memo matches the shortlist values
// for that run"), or that claims an action the gate forbids ("I have entered
// you"). One corrective retry, then the memo is simply omitted.

export const MEMO_MODEL = modelFor('tournamentMemo');
export const MEMO_PROMPT_VERSION = 'memo-v3';
export const MEMO_SCHEMA_VERSION = 'memo-v1';
export const MEMO_MIN_WORDS = 150;
export const MEMO_MAX_WORDS = 550;

export const memoSchema = z.object({ paragraphs: z.array(z.string().min(1)).min(2).max(5) });
export type MemoOutput = z.infer<typeof memoSchema>;

export interface MemoPrompt {
  system: string;
  user: string;
}

export interface MemoModelClient {
  complete(prompt: MemoPrompt): Promise<{ raw: unknown; usage: TokenUsage }>;
}

export interface MemoInput {
  result: ShortlistResult;
  /** Formats a home-currency amount exactly as the page shows it, e.g. "A$1,360". */
  money: (amount: number) => string;
  /** Formats an ISO date as the page shows it, e.g. "Thu 18 Sep". */
  day: (iso: string) => string;
  /** Today (ISO date), so the memo knows what is urgent and what has passed. */
  today?: string;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

interface EventFacts {
  /** Lower-case words that identify the event in prose: its city and the distinctive words of its name. */
  names: string[];
  money: Set<string>;
  points: Set<number>;
  days: Set<string>;
  ratios: Set<string>;
}

interface Facts {
  lines: string[];
  /** Events whose entry closes within 7 days: the memo must name each (the decision this week). */
  urgent: EventFacts[];
  events: EventFacts[];
  /** Every word that may follow "Challenger", "ATP 250" and the like: the shortlist's own names. */
  knownWords: Set<string>;
}

const GENERIC_NAME_WORDS = new Set([
  'live',
  'test',
  'challenger',
  'atp',
  'wta',
  'itf',
  'qualifying',
  'open',
  'cup',
]);

function words(text: string | null): string[] {
  return (text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\d]+/u)
    .filter(Boolean);
}

function facts({ result, money, day: rawDay, today }: MemoInput): Facts {
  // ICU writes September as "Sept" in some locales; one spelling throughout.
  const day = (iso: string) => rawDay(iso).replace(/\bSept\b/, 'Sep');
  const knownWords = new Set<string>();
  const events: EventFacts[] = [];
  const urgent: EventFacts[] = [];
  const lines = result.candidates.map((c) => {
    const ev: EventFacts = {
      names: [...new Set([...words(c.city), ...words(c.name)])].filter(
        (w) => !GENERIC_NAME_WORDS.has(w) && !/^\d+$/.test(w),
      ),
      money: new Set(),
      points: new Set(),
      days: new Set(),
      ratios: new Set([c.ratio.toFixed(2)]),
    };
    for (const w of [...words(c.city), ...words(c.name)]) knownWords.add(w);
    events.push(ev);
    const add = (n: number) => {
      const s = money(n);
      ev.money.add(s);
      ev.money.add(money(Math.abs(n)));
      return s;
    };
    const r1 = c.rounds[0];
    const deadline = c.entryDeadline ? day(c.entryDeadline) : null;
    const closesIn = c.entryDeadline && today ? daysBetween(today, c.entryDeadline) : null;
    if (closesIn != null && closesIn >= 0 && closesIn <= 7) urgent.push(ev);
    const start = day(c.startDate);
    ev.days.add(start);
    if (deadline) ev.days.add(deadline);
    for (const r of c.rounds) {
      add(r.prize);
      add(r.net);
      ev.points.add(r.points);
    }
    if (c.defendPoints) ev.points.add(c.defendPoints);
    return [
      `#${c.rank} ${c.name}`,
      [c.tier, c.surface, c.city].filter(Boolean).join(', '),
      `starts ${start}`,
      deadline
        ? `entry closes ${deadline}${closesIn != null ? (closesIn < 0 ? ' (already closed)' : ` (in ${closesIn} days${closesIn <= 7 ? ', DECIDE THIS WEEK' : ''})`) : ''}`
        : 'no entry deadline published',
      `acceptance: ${c.acceptanceLabel}`,
      `cost to go ${add(c.cost.total)}`,
      r1 ? `${r1.label}: prize ${add(r1.prize)}, net ${add(r1.net)}, ${r1.points} points` : null,
      `expected net ${add(c.exp)}, worst ${add(c.lo)}, best ${add(c.hi)}`,
      `cost-to-prize ratio ${c.ratio.toFixed(2)}`,
      c.defendPoints ? `defence week: ${c.defendPoints} points expire` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  });
  return { lines, urgent, events, knownWords };
}

const SYSTEM = `You are the Tournament Agent writing this week's recommendation memo for a professional tennis player, about the shortlist below.
Write ${MEMO_MIN_WORDS + 100} to ${MEMO_MAX_WORDS - 50} words in two to five short paragraphs, plain and direct, like a good manager.
Lead with the first pick and why, then the decisions that matter this week (any event marked DECIDE THIS WEEK, any defence week), then what can wait.
Discuss events in the shortlist's own order and never contradict it: a lower cost-to-prize ratio is better, and the ranking already reflects it.
Mention a defence week only if one is listed.
Write dates exactly as given (for example "Sat 3 Oct"), never spelled out.
Use only the figures given, copied exactly as written (money, points, dates, ratios), and only for the event they belong to. Never compute a new figure, never round, never invent a date, event, opponent or fact.
Name each event by its city the first time you discuss it, and say nothing about field strength, form, ranking gains or anything else not given.
You never act for the player: say "accept before" and the deadline date given, never "I have entered you". Entering is the player's decision.
No em dashes. Australian English. No model or vendor names.`;

export function buildMemoPrompt(input: MemoInput, correction?: string): MemoPrompt {
  const f = facts(input);
  const user = [
    input.today ? `Today is ${input.day(input.today).replace(/\bSept\b/, 'Sep')}.` : '',
    `Events scanned: ${input.result.scannedCount}. Shortlisted: ${input.result.candidates.length}. Excluded: ${input.result.excluded.length}.`,
    'Shortlist, ranked:',
    ...f.lines,
    correction
      ? `\nYour previous memo was rejected: ${correction}. Rewrite it using only the figures above, exactly as written.`
      : '',
  ].join('\n');
  return { system: SYSTEM, user };
}

const MONEY_TOKEN = /-?(?:[A-Z]{1,3}\$|€|£|¥|\$)\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?/g;
const POINTS_TOKEN = /(\d+)\s+(?:ATP |WTA |ranking )?points?\b/gi;
const DAY_TOKEN =
  /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s\d{1,2}\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/g;
const FORBIDDEN = /\b(?:I|we)(?:'ve| have)?\s+(?:entered|withdrawn|booked|paid|submitted)\b/i;

const LONG_DAY =
  /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s(\d{1,2})(?:st|nd|rd|th)?\s(January|February|March|April|May|June|July|August|September|October|November|December)\b/g;

/** "Saturday, 7 November" as "Sat 7 Nov", so spelled-out dates are checked too. */
function shortDay(sentence: string): string {
  return sentence.replace(
    LONG_DAY,
    (_m, wd: string, d: string, mo: string) => `${wd.slice(0, 3)} ${d} ${mo.slice(0, 3)}`,
  );
}

const EVENT_NAME =
  /\b(?:Challenger|ATP(?:\s250)?|WTA(?:\s\d+)?|ITF(?:\s[MW]\d+)?)\s+([A-Z][\p{L}'-]+)/gu;
const RATIO_TOKEN = /\bratio(?:\sof)?\s(\d\.\d{2})\b/gi;

/** Returns the reason a memo breaks T-15 / T-AC-14, or null when it is sound. */
export function checkMemo(memo: MemoOutput, input: MemoInput): string | null {
  const text = memo.paragraphs.join('\n');
  const count = text.split(/\s+/).filter(Boolean).length;
  if (count < MEMO_MIN_WORDS || count > MEMO_MAX_WORDS) {
    return `it has ${count} words; write ${MEMO_MIN_WORDS} to ${MEMO_MAX_WORDS}`;
  }
  if (/—/.test(text)) return 'it uses an em dash';
  if (FORBIDDEN.test(text)) return 'it claims to have acted for the player';
  const f = facts(input);

  // Every event it names must be on the shortlist.
  for (const match of text.matchAll(EVENT_NAME)) {
    const word = match[1]!.toLowerCase();
    if (!f.knownWords.has(word) && !GENERIC_NAME_WORDS.has(word)) {
      return `"${match[0]}" is not an event on the shortlist`;
    }
  }

  // Every figure must belong to the event being discussed: the one named in
  // the sentence, else the last one named earlier in the paragraph; with no
  // single event in view, it must at least be one of the shortlist's figures.
  const norm = (x: string) => x.replace(/\s/g, '').replace('−', '-').replace(/^-/, '');
  const all = {
    money: new Set(f.events.flatMap((e) => [...e.money].map(norm))),
    points: new Set(f.events.flatMap((e) => [...e.points])),
    days: new Set(f.events.flatMap((e) => [...e.days])),
    ratios: new Set(f.events.flatMap((e) => [...e.ratios])),
  };
  // The decision this week must be in it: every event closing within 7 days.
  const allWords = words(text);
  for (const ev of f.urgent) {
    if (!ev.names.some((n) => allWords.includes(n))) {
      return `it doesn't mention ${ev.names[0]}, whose entry closes this week`;
    }
  }
  if (/\b(?:has|have|had)\s+(?:already\s+)?(?:passed|closed)\b/i.test(text) && f.urgent.length) {
    return 'it says a deadline has passed; none on the shortlist has';
  }

  for (const paragraph of memo.paragraphs.map(shortDay)) {
    let subject: EventFacts | null = null;
    for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
      const lower = words(sentence);
      const named = f.events.filter((e) => e.names.some((n) => lower.includes(n)));
      if (named.length === 1) subject = named[0]!;
      else if (named.length > 1) subject = null;
      const scope = subject
        ? {
            money: new Set([...subject.money].map(norm)),
            points: subject.points,
            days: subject.days,
            ratios: subject.ratios,
          }
        : all;
      const where = subject ? ` for ${subject.names[0]}` : '';
      for (const token of sentence.match(MONEY_TOKEN) ?? []) {
        if (!scope.money.has(norm(token)))
          return `the amount ${token} is not in the shortlist${where}`;
      }
      for (const m of sentence.matchAll(POINTS_TOKEN)) {
        if (!scope.points.has(Number(m[1]))) return `"${m[0]}" is not in the shortlist${where}`;
      }
      for (const token of sentence.match(DAY_TOKEN) ?? []) {
        if (!scope.days.has(token.replace('Sept', 'Sep'))) {
          return `the date ${token} is not in the shortlist${where}`;
        }
      }
      for (const m of sentence.matchAll(RATIO_TOKEN)) {
        if (!scope.ratios.has(m[1]!)) return `the ratio ${m[1]} is not in the shortlist${where}`;
      }
    }
  }
  return null;
}

export async function generateMemo(
  client: MemoModelClient,
  input: MemoInput,
): Promise<{ output: MemoOutput; usage: TokenUsage }> {
  const first = await client.complete(buildMemoPrompt(input));
  const firstParsed = memoSchema.safeParse(first.raw);
  const firstProblem = firstParsed.success ? checkMemo(firstParsed.data, input) : 'wrong shape';
  if (firstParsed.success && !firstProblem) return { output: firstParsed.data, usage: first.usage };

  const second = await client.complete(buildMemoPrompt(input, firstProblem!));
  const usage = {
    inputTokens: first.usage.inputTokens + second.usage.inputTokens,
    outputTokens: first.usage.outputTokens + second.usage.outputTokens,
  };
  const secondParsed = memoSchema.safeParse(second.raw);
  const secondProblem = secondParsed.success ? checkMemo(secondParsed.data, input) : 'wrong shape';
  if (secondParsed.success && !secondProblem) return { output: secondParsed.data, usage };
  throw new AgentValidationError(`tournament/memo: rejected twice: ${secondProblem}`, usage);
}

export class MemoModelCallError extends Error {}

export function createOpenAIMemoClient(config: { apiKey: string; model: string }): MemoModelClient {
  return {
    async complete({ system, user }) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 1200,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'tournament_memo',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: { paragraphs: { type: 'array', items: { type: 'string' } } },
                required: ['paragraphs'],
              },
            },
          },
        }),
      });
      if (!response.ok) {
        throw new MemoModelCallError(
          `Memo model call failed: ${response.status} ${await response.text()}`,
        );
      }
      const body = (await response.json()) as {
        choices: Array<{ message: { content: string | null } }>;
        usage: { prompt_tokens: number; completion_tokens: number };
      };
      const content = body.choices[0]?.message.content;
      if (!content) throw new MemoModelCallError('Memo model response had no content');
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
