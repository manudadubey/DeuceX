// The cost pass (step 5.4's first "done when": model spend per Pro player
// with realistic fixtures is under A$7.35 a month, PRD-00 section 6).
//
// Runs one month of a busy Pro player's model calls against the real
// providers, through the same agent functions and model constants apps/api
// uses, and prices each call with packages/actions' pricing table. Volumes
// are TECH-ARCHITECTURE.md section 5's own assumptions, taken as the worst
// case: every daily agent regenerates every day (no input-hash cache hits),
// so the total is an upper bound on what the cache lets through.
//
// Fixtures are generated here, not checked in: spoken match notes with
// macOS `say` (so transcription is billed on real audio length), and
// receipt and menu photos rendered from HTML by `qlmanage` at 1600px, which
// the vision model tiles the same way as a portrait phone photo.
//
// Usage (macOS, OPENAI_API_KEY in the repo's .env):
//   pnpm --filter @deucex/api exec tsx scripts/cost-pass.ts <work-dir> [aud-per-usd]
// Writes <work-dir>/runs.json (one row per call, for agent_runs in staging)
// and prints the summary. Costs real money: about US$0.50 a run.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import {
  AgentValidationError,
  calculateAudioCost,
  calculateCost,
  type TokenUsage,
} from '@deucex/actions';
import {
  CONTENT_DRAFT_MODEL,
  CONTENT_REWRITE_MODEL,
  EXTRACTION_MODEL,
  FINANCIAL_ACTION_MODEL,
  INSIGHT_MODEL,
  MENU_EXTRACTION_MODEL,
  PATRON_NOTE_MODEL,
  PROSE_MODEL,
  RECEIPT_EXTRACTION_MODEL,
  createOpenAIContentDraftClient,
  createOpenAIContentRewriteClient,
  createOpenAIExtractionClient,
  createOpenAIFinancialActionClient,
  createOpenAIInsightClient,
  createOpenAIMenuExtractionClient,
  createOpenAIPatronNoteClient,
  createOpenAIProseClient,
  createOpenAIReceiptExtractionClient,
  extractMatchNote,
  extractMenu,
  extractReceipt,
  generateConditionsProse,
  generateContentDraft,
  generateFinancialAction,
  generateInsight,
  generatePatronNote,
  modelFor,
  rewriteContent,
  type ActionCandidate,
  type ConditionsBriefRules,
  type DraftNote,
  type MindsetNote,
  type ProseBriefInput,
} from '@deucex/agents';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

const work: string = process.argv[2] ?? '';
if (!work) throw new Error('Usage: cost-pass.ts <work-dir> [aud-per-usd]');
const audPerUsd = Number(process.argv[3] ?? '1.4224');
mkdirSync(join(work, 'audio'), { recursive: true });
mkdirSync(join(work, 'img'), { recursive: true });

interface Run {
  agentName: string;
  model: string;
  label: string;
  status: 'succeeded' | 'failed';
  costUsd: number;
  usage: TokenUsage | null;
  audioSeconds: number | null;
  ms: number;
  error?: string;
  /** A draft's body, so a resumed run can still rewrite it. */
  extra?: string;
}
const runs: Run[] = [];

// Resume: a rerun keeps every call the last run finished (succeeded, or
// failed validation, which is a real outcome) and redoes only the ones the
// provider's rate limit refused, so a rerun never pays twice.
const previous = new Map<string, Run>();
if (existsSync(join(work, 'runs.json'))) {
  for (const r of JSON.parse(readFileSync(join(work, 'runs.json'), 'utf8')) as Run[]) {
    if (r.status === 'succeeded' || !(r.error ?? '').includes('429')) {
      previous.set(`${r.agentName}|${r.model}|${r.label}`, r);
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(
  agentName: string,
  model: string,
  label: string,
  fn: () => Promise<{ usage?: TokenUsage; audioSeconds?: number; extra?: string }>,
): Promise<string | undefined> {
  const kept = previous.get(`${agentName}|${model}|${label}`);
  if (kept) {
    runs.push(kept);
    return kept.extra;
  }
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fn();
      const cost =
        r.audioSeconds != null
          ? calculateAudioCost(model, r.audioSeconds)
          : r.usage
            ? calculateCost(model, r.usage)
            : null;
      runs.push({
        agentName,
        model,
        label,
        status: 'succeeded',
        costUsd: cost?.amount ?? 0,
        usage: r.usage ?? null,
        audioSeconds: r.audioSeconds ?? null,
        ms: Date.now() - started,
        ...(r.extra ? { extra: r.extra } : {}),
      });
      return r.extra;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // The provider's tokens-per-minute limit: wait it out, as a queue retry would.
      if (message.includes('429') && attempt < 6) {
        const wait = Number(/try again in ([\d.]+)s/.exec(message)?.[1] ?? '20');
        await sleep(Math.ceil(wait * 1000) + 2000);
        continue;
      }
      // A validation failure still paid for both attempts (recordRun prices it too).
      const usage = err instanceof AgentValidationError ? (err.usage ?? null) : null;
      runs.push({
        agentName,
        model,
        label,
        status: 'failed',
        costUsd: usage ? (calculateCost(model, usage)?.amount ?? 0) : 0,
        usage,
        audioSeconds: null,
        ms: Date.now() - started,
        error: message.slice(0, 200),
      });
      return undefined;
    }
  }
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) await fn(items[i++]!);
    }),
  );
}

// ---------------------------------------------------------------------------
// Fixtures: a month of an ITF/Challenger player's notes, in their own words.
// ---------------------------------------------------------------------------

const NOTES: Array<{ ctx: 'match' | 'practice' | 'travel'; text: string }> = [
  {
    ctx: 'match',
    text: 'Lost to Kovalenko in a third-set breaker, six-four, three-six, six-seven. The second serve again. I was rushing it, especially at four all in the breaker, double faulted twice. Forehand felt good all match. Conditions were heavy, clay was slow after the rain. Need to take more time between points when it gets tight.',
  },
  {
    ctx: 'practice',
    text: 'Two hours with Marco this morning. Mostly serve, second serve kick to the backhand side. Started finding the toss about forty minutes in. Legs heavy from yesterday. Did the band work after, hip felt fine. Tomorrow lighter, some returns and then gym.',
  },
  {
    ctx: 'match',
    text: "Won first round against a local wildcard, six-two, six-three. Pretty clean. Served well, first serve percentage felt high, probably seventy. Returned deep. He didn't have much. Next round is the fourth seed, lefty, big serve. Need to read the slice out wide on the deuce side.",
  },
  {
    ctx: 'match',
    text: 'Lost to the fourth seed, four-six, six-seven. Close. Had set point in the second at six-five, missed a backhand pass by a foot. His lefty serve out wide got me all day on the deuce side. I stood too close. Proud of the fight but frustrated with the return position.',
  },
  {
    ctx: 'travel',
    text: 'Travel day from Genoa to Poznan through Munich. Five hours of connections. Slept badly. Ate at the airport, not great. Hotel is ten minutes from the club, good. Need to find a stringer tomorrow, the club one is booked.',
  },
  {
    ctx: 'practice',
    text: 'First hit in Poznan, courts are quick for clay, balls fly. Dropped tension by one kilo, felt more control. Worked on returns from further back. Coach says my split step is late on the serve. Forty five minutes of that. Good session.',
  },
  {
    ctx: 'match',
    text: 'Qualifying round one, won six-four, seven-five. Nervy start, broken first game. Settled after that. Backhand down the line worked. Second serve was better, took my time like I said I would. Mood good, a bit tired.',
  },
  {
    ctx: 'match',
    text: 'Qualifying round two, lost six-three, three-six, four-six. Went away in the third. Lost focus after a bad line call at two all, kept thinking about it for three games. Have to let those go. Physically fine.',
  },
  {
    ctx: 'practice',
    text: 'Rest day mostly. Light hit, thirty minutes, just rhythm. Watched video of the loss with coach. Clear pattern that I rush after I lose a point I think I should have won. Going to try the towel routine every point for a week.',
  },
  {
    ctx: 'travel',
    text: 'Drove to Sibiu with two other players, shared the car hire, much cheaper than flying. Seven hours. Stopped for lunch. Hotel is basic but fine. Club looks nice, altitude is a bit higher, ball might fly.',
  },
  {
    ctx: 'match',
    text: 'Won round one in Sibiu, six-one, six-four. Served really well, maybe three doubles all match. Towel routine helped, felt calm. Ball flying a little, took some pace off. Happy with that one.',
  },
  {
    ctx: 'match',
    text: 'Round two, won in three, three-six, six-four, six-two. Slow start, he was hitting heavy. Changed to more slice on the backhand and it broke his rhythm. Second set was the turn. Legs good in the third. Quarterfinal tomorrow.',
  },
  {
    ctx: 'match',
    text: 'Quarterfinal loss, five-seven, four-six. He was just better today. Very consistent, no free points. I tried to go bigger too early. Still, best week in a while. Points will help. Tired but in a good way.',
  },
  {
    ctx: 'practice',
    text: 'Back home for a training block. Gym in the morning, legs and core. Hit for ninety minutes in the afternoon, lots of patterns, serve plus one forehand. Shoulder a bit tight after, iced it.',
  },
  {
    ctx: 'practice',
    text: 'Second day of the block. Worked on the return position against lefties, standing further back and to the left. Coach served for forty minutes. Much better read on the wide one. Shoulder okay today.',
  },
  {
    ctx: 'practice',
    text: 'Practice set against a junior who is ranked well. Won six-four but lost focus at five-three, dropped serve. Same pattern, rushed after a missed easy volley. Towel routine slipped. Remind myself.',
  },
  {
    ctx: 'travel',
    text: 'Flying to Portugal tomorrow for two weeks of events. Packed three frames, restrung two at twenty four and twenty three. Budget is tight this month, going to share rooms if I can.',
  },
  {
    ctx: 'match',
    text: 'First round in Portugal, won seven-six, six-four. Wind was strong, very hard to serve into it. Kept the first serve percentage high by taking pace off. Tiebreak I stayed calm, used the routine. Good.',
  },
  {
    ctx: 'match',
    text: 'Round two, lost six-seven, two-six. Wind again. Lost the tiebreak from five-two up, three straight errors, all rushed. Then went flat in the second. That is the one thing I keep doing. Need a plan for being ahead in breakers.',
  },
  {
    ctx: 'practice',
    text: 'Hit with a doubles partner in the afternoon, we might play together next week. Good chemistry. Worked on the serve toss in the wind, lower toss helps. Mood a bit flat after yesterday but better by the end.',
  },
];

// ---------------------------------------------------------------------------
// Match Scribe: 20 notes, transcription plus extraction.
// ---------------------------------------------------------------------------

function audioFor(i: number, text: string): string {
  const aiff = join(work, 'audio', `note-${i}.aiff`);
  const m4a = join(work, 'audio', `note-${i}.m4a`);
  if (!existsSync(m4a)) {
    execFileSync('say', ['-r', '165', '-o', aiff, text]);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', aiff, m4a]);
  }
  return m4a;
}

async function transcribe(path: string): Promise<{ text: string; duration: number }> {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(path)], { type: 'audio/mp4' }), 'note.m4a');
  form.append('model', modelFor('matchScribeTranscribe'));
  form.append('response_format', 'verbose_json');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`transcription ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { text: string; duration: number };
  return body;
}

// ---------------------------------------------------------------------------
// Images: receipts and menus, rendered to 1600px PNGs.
// ---------------------------------------------------------------------------

function render(name: string, html: string): string {
  const htmlPath = join(work, 'img', `${name}.html`);
  const png = `${htmlPath}.png`;
  if (!existsSync(png)) {
    writeFileSync(htmlPath, html);
    execFileSync('qlmanage', ['-t', '-s', '1600', '-o', join(work, 'img'), htmlPath], {
      stdio: 'ignore',
    });
  }
  return `data:image/png;base64,${readFileSync(png).toString('base64')}`;
}

const MERCHANTS = [
  [
    'Trattoria da Marco',
    'Genova',
    'EUR',
    [
      ['Pasta al pesto', '14,00'],
      ['Acqua minerale', '3,50'],
      ['Insalata mista', '7,00'],
    ],
  ],
  [
    'Stringing Pro Poznan',
    'Poznań',
    'PLN',
    [
      ['Naciąg x2', '120,00'],
      ['Owijka', '25,00'],
    ],
  ],
  [
    'Hotel Mercure',
    'Sibiu',
    'RON',
    [
      ['Cazare 3 nopti', '945,00'],
      ['Mic dejun', '90,00'],
      ['Taxa oras', '15,00'],
    ],
  ],
  [
    'Lidl',
    'Faro',
    'EUR',
    [
      ['Bananas', '1,29'],
      ['Water 6x1.5L', '2,49'],
      ['Oats', '1,99'],
      ['Chicken', '5,79'],
    ],
  ],
  ['Uber', 'Lisboa', 'EUR', [['Trip to airport', '18,40']]],
] as const;

function receiptHtml(i: number): string {
  const [name, city, cur, lines] = MERCHANTS[i % MERCHANTS.length]!;
  const items = lines.map(([d, a]) => `${d} ...... ${a}`).join('<br>');
  const day = String((i % 27) + 1).padStart(2, '0');
  return `<html><body style="font-family:Courier;width:420px;padding:24px;background:#fff;font-size:15px"><h3>${name.toUpperCase()}</h3><p>${city}<br>${day}/09/2026 1${i % 10}:2${i % 6}</p><hr><p>${items}</p><hr><p><b>TOTAL ${cur}</b> see lines<br>Card ****${4400 + i}</p></body></html>`;
}

function menuHtml(i: number, page: number): string {
  const dishes = [
    ['Grilled chicken breast, rice, vegetables', 16],
    ['Spaghetti bolognese', 14],
    ['Salmon fillet, potatoes, green beans', 22],
    ['Caesar salad with chicken', 13],
    ['Pork schnitzel, fries', 17],
    ['Vegetable risotto', 15],
    ['Beef burger, fries', 18],
    ['Tuna nicoise salad', 16],
    ['Omelette, toast', 9],
    ['Seafood paella (for one)', 21],
  ] as const;
  const rows = dishes
    .slice(page * 5, page * 5 + 5)
    .map(([d, p]) => `<tr><td>${d}</td><td style="text-align:right">${p + (i % 3)}.00</td></tr>`)
    .join('');
  return `<html><body style="font-family:Georgia;width:520px;padding:28px;background:#fdfbf5"><h2>Café Central · Menu ${page + 1}</h2><table style="width:100%;font-size:17px">${rows}</table><p style="font-size:12px">Prices in EUR, service included.</p></body></html>`;
}

// ---------------------------------------------------------------------------
// The month.
// ---------------------------------------------------------------------------

const RULES: ConditionsBriefRules = {
  tempRange: '17–22°C',
  tempMax: 22,
  rhRange: '55–65%',
  rhMax: 65,
  wind: '8–14 km/h',
  altitudeM: 80,
  ball: 'Dunlop Fort',
  ballDiff: false,
  io: 'Outdoor clay',
  airAmber: false,
  tension: false,
  tensionNote: 'Keep 24/23. Cooler air holds tension; no test needed.',
  testMains: null,
  testCrosses: null,
  frames: 3,
  framesSubLine: 'Normal grip',
  grip: 'Normal grip',
  refreshed: true,
  forecastSource: 'open-meteo',
};

const CITIES = ['Poznań', 'Sibiu', 'Genoa', 'Faro', 'Lisbon', 'Bratislava', 'Szczecin'];

async function main(): Promise<void> {
  const extraction = createOpenAIExtractionClient({ apiKey: apiKey!, model: EXTRACTION_MODEL });
  const insight = createOpenAIInsightClient({ apiKey: apiKey!, model: INSIGHT_MODEL });
  const financial = createOpenAIFinancialActionClient({
    apiKey: apiKey!,
    model: FINANCIAL_ACTION_MODEL,
  });
  const receipts = createOpenAIReceiptExtractionClient({
    apiKey: apiKey!,
    model: RECEIPT_EXTRACTION_MODEL,
  });
  const menus = createOpenAIMenuExtractionClient({ apiKey: apiKey!, model: MENU_EXTRACTION_MODEL });
  const prose = createOpenAIProseClient({ apiKey: apiKey!, model: PROSE_MODEL });
  const patronNotes = createOpenAIPatronNoteClient({ apiKey: apiKey!, model: PATRON_NOTE_MODEL });
  const drafts = createOpenAIContentDraftClient({ apiKey: apiKey! });
  const rewrites = createOpenAIContentRewriteClient({ apiKey: apiKey! });

  const monthStart = new Date('2026-09-01T08:00:00Z');
  const dayAt = (d: number) => new Date(monthStart.getTime() + d * 86_400_000);
  const noteDays = NOTES.map((_, i) => Math.floor((i * 30) / NOTES.length));

  // Match Scribe: 20 x (transcription + extraction).
  console.log('Match Scribe: generating audio...');
  const audio = NOTES.map((n, i) => audioFor(i, n.text));
  const transcripts: string[] = [];
  await pool(
    NOTES.map((n, i) => ({ n, i })),
    4,
    async ({ n, i }) => {
      let text = n.text;
      await call(
        'match-scribe-transcribe',
        modelFor('matchScribeTranscribe'),
        `note ${i}`,
        async () => {
          const t = await transcribe(audio[i]!);
          text = t.text;
          return { audioSeconds: t.duration };
        },
      );
      transcripts[i] = text;
      await call('match-scribe-extract', EXTRACTION_MODEL, `note ${i}`, async () => {
        const r = await extractMatchNote(extraction, {
          ctx: n.ctx,
          transcript: text,
          tagVocabulary: ['Second serve', 'Tiebreak', 'Clay', 'Return', 'Focus', 'Travel', 'Wind'],
        });
        return { usage: r.usage };
      });
    },
  );

  const mindsetNotes: MindsetNote[] = NOTES.map((n, i) => ({
    id: `n${i}`,
    recordedAt: dayAt(noteDays[i]!).toISOString(),
    ctx: n.ctx,
    result: null,
    mood: null,
    tags: [],
    transcript: transcripts[i] ?? n.text,
    summary: (transcripts[i] ?? n.text).slice(0, 140),
    cond: null,
  }));

  // Mindset Coach and Financial Agent: daily, 30 each, no cache hits.
  console.log('Daily agents...');
  const candidates: ActionCandidate[] = [
    {
      key: 'update_balance',
      effectWeeks: 0.1,
      hoursEffort: 0.02,
      score: 5,
      facts: { key: 'update_balance', daysSinceUpdate: 9 },
    },
    {
      key: 'chase_overdue_receivable',
      effectWeeks: 0.78,
      hoursEffort: 0.25,
      score: 3.12,
      facts: {
        key: 'chase_overdue_receivable',
        label: 'Genoa Q2',
        daysOverdue: 7,
        amountHomeEstimate: 890,
      },
    },
    {
      key: 'trim_weekly_overspend',
      effectWeeks: 0.3,
      hoursEffort: 0.5,
      score: 0.6,
      facts: { key: 'trim_weekly_overspend', overAmount: 140 },
    },
  ];
  await pool(
    Array.from({ length: 30 }, (_, d) => d),
    4,
    async (d) => {
      const now = dayAt(d);
      await call('mindset-coach', INSIGHT_MODEL, `day ${d + 1}`, async () => {
        const r = await generateInsight(insight, {
          lang: 'en',
          timezone: 'Europe/Rome',
          notes: mindsetNotes.filter((n) => new Date(n.recordedAt) <= now),
          checkins: Array.from({ length: Math.min(d, 7) }, (_, k) => ({
            date: dayAt(d - k - 1)
              .toISOString()
              .slice(0, 10),
            value: (2 + ((d + k) % 4)) as 1 | 2 | 3 | 4 | 5,
            sentence: null,
          })),
          existingPatterns: [],
          quietMatchMornings: false,
          hasMatchToday: d % 7 === 2,
          notTodayCountLast7Days: 0,
          recentFocuses: [],
          now,
        });
        return r.usage ? { usage: r.usage } : {};
      });
      await call('financial', FINANCIAL_ACTION_MODEL, `day ${d + 1}`, async () => {
        const r = await generateFinancialAction(financial, candidates[d % candidates.length]!);
        return { usage: r.usage };
      });
    },
  );

  // Receipts: 15 scans. Fuel: 15 menu scans, every third one two pages.
  console.log('Receipts and menus: rendering...');
  const receiptImgs = Array.from({ length: 15 }, (_, i) => render(`receipt-${i}`, receiptHtml(i)));
  const menuImgs = Array.from({ length: 15 }, (_, i) =>
    Array.from({ length: i % 3 === 0 ? 2 : 1 }, (_, p) => render(`menu-${i}-${p}`, menuHtml(i, p))),
  );
  await pool(
    Array.from({ length: 15 }, (_, i) => i),
    2,
    async (i) => {
      await call(
        'financial-receipt-extract',
        RECEIPT_EXTRACTION_MODEL,
        `receipt ${i}`,
        async () => {
          const r = await extractReceipt(receipts, { imageDataUrl: receiptImgs[i]! });
          return { usage: r.usage };
        },
      );
      await call(
        'fuel-menu-scan',
        MENU_EXTRACTION_MODEL,
        `menu ${i} (${menuImgs[i]!.length}p)`,
        async () => {
          const r = await extractMenu(menus, {
            imageDataUrls: menuImgs[i]!,
            mode: (['pre-match', 'post-match', 'travel', 'rest', 'practice'] as const)[i % 5]!,
            currencyHint: 'EUR',
            place: 'Faro, POR',
          });
          return { usage: r.usage };
        },
      );
    },
  );

  // Conditions: 5 weekly runs of 5 briefs in one batched call, plus 4 single refreshes.
  console.log('Conditions...');
  const brief = (id: string, city: string, tweak: number): ProseBriefInput => ({
    tournamentId: id,
    name: city,
    city,
    rules: {
      ...RULES,
      tempMax: 22 + tweak,
      tempRange: `${17 + tweak}–${22 + tweak}°C`,
      tension: tweak > 6,
    },
    previousEvent: tweak % 2 ? { place: 'Genoa', tempMaxC: 27, ball: 'Dunlop Fort' } : null,
  });
  const conditionsCalls: ProseBriefInput[][] = [
    ...Array.from({ length: 5 }, (_, w) =>
      Array.from({ length: 5 }, (_, b) =>
        brief(`w${w}b${b}`, CITIES[(w + b) % CITIES.length]!, (w + b) % 9),
      ),
    ),
    ...Array.from({ length: 4 }, (_, r) => [brief(`r${r}`, CITIES[r]!, 7 + r)]),
  ];
  await pool(conditionsCalls, 3, async (batch) => {
    await call('conditions', PROSE_MODEL, `${batch.length} brief(s)`, async () => {
      const r = await generateConditionsProse(prose, batch);
      return { usage: r.usage };
    });
  });

  // Fans: 8 patron notes.
  console.log('Fans and Content...');
  const kinds = ['thanks', 'nudge', 'checkin', 'welcome'] as const;
  await pool(
    Array.from({ length: 8 }, (_, i) => i),
    4,
    async (i) => {
      await call('fans/patron-note', PATRON_NOTE_MODEL, `${kinds[i % 4]}`, async () => {
        const r = await generatePatronNote(patronNotes, {
          kind: kinds[i % 4]!,
          playerFirstName: 'Arya',
          patronFirstName: ['Anna', 'Tom', 'Mira', 'Luca'][i % 4]!,
          tierName: ['Courtside', 'Locker Room'][i % 2]!,
          tenureMonths: 2 + i,
          ...(kinds[i % 4] === 'thanks' ? { leftWhen: 'last month' } : {}),
          ...(kinds[i % 4] === 'nudge' ? { retryDay: 'Friday' } : {}),
          otherPatronFirstNames: ['Sophie', 'Jonas'],
        });
        return { usage: r.usage };
      });
    },
  );

  // Content: 8 drafts on the drafting tier, and a rewrite of each.
  const draftNote = (i: number): DraftNote => ({
    id: `n${i}`,
    ctx: NOTES[i]!.ctx,
    recordedAt: dayAt(noteDays[i]!).toISOString(),
    transcript: transcripts[i] ?? NOTES[i]!.text,
    result: null,
    opponent: null,
    round: null,
    surface: 'clay',
    mood: null,
    tags: [],
  });
  const matchNoteIdx = NOTES.map((n, i) => (n.ctx === 'match' ? i : -1))
    .filter((i) => i >= 0)
    .slice(0, 8);
  await pool(matchNoteIdx, 2, async (i) => {
    const body = await call('content', CONTENT_DRAFT_MODEL, `draft from note ${i}`, async () => {
      const r = await generateContentDraft(drafts, {
        lang: 'en',
        playerFirstName: 'Arya',
        note: draftNote(i),
        earlierNotes: [draftNote(Math.max(0, i - 1)), draftNote(Math.max(0, i - 2))],
        examples: [
          {
            subject: 'A good week in Sibiu',
            body: 'Quarterfinal in Sibiu, my best result in a while. I served well all week and kept calm in the tight moments. Thank you for being part of it.',
          },
        ],
        wantsPracticeSection: i % 2 === 0,
        privateNames: ['Marco'],
        nextDeadline: null,
      });
      return { usage: r.usage, extra: r.draft.body };
    });
    if (!body) return;
    await call('content', CONTENT_REWRITE_MODEL, `rewrite of note ${i}`, async () => {
      const r = await rewriteContent(rewrites, {
        variant: (['shorter', 'warmer', 'tactical'] as const)[i % 3]!,
        lang: 'en',
        body,
        result: null,
      });
      return { usage: r.usage };
    });
  });

  // ---------------------------------------------------------------------------
  writeFileSync(join(work, 'runs.json'), JSON.stringify(runs, null, 2));
  const byAgent = new Map<string, { n: number; failed: number; usd: number }>();
  for (const r of runs) {
    const key = `${r.agentName} (${r.model})`;
    const a = byAgent.get(key) ?? { n: 0, failed: 0, usd: 0 };
    a.n++;
    if (r.status === 'failed') a.failed++;
    a.usd += r.costUsd;
    byAgent.set(key, a);
  }
  const total = runs.reduce((s, r) => s + r.costUsd, 0);
  console.log('\n| Agent (model) | Calls | Failed | US$ | A$ |');
  console.log('|---|---|---|---|---|');
  for (const [k, a] of [...byAgent].sort()) {
    console.log(
      `| ${k} | ${a.n} | ${a.failed} | ${a.usd.toFixed(4)} | ${(a.usd * audPerUsd).toFixed(4)} |`,
    );
  }
  console.log(
    `| **Total** | ${runs.length} | ${runs.filter((r) => r.status === 'failed').length} | ${total.toFixed(4)} | **${(total * audPerUsd).toFixed(4)}** |`,
  );
  console.log(
    `\nA$ per Pro player per month (worst case, no cache hits): ${(total * audPerUsd).toFixed(2)} against the A$7.35 ceiling (${((total * audPerUsd * 100) / 7.35).toFixed(1)} percent). Rate: A$${audPerUsd} per US$.`,
  );
  const failures = runs.filter((r) => r.status === 'failed');
  if (failures.length)
    console.log(
      '\nFailures:',
      failures.map((f) => `${f.agentName} ${f.label}: ${f.error}`).join('\n'),
    );
}

await main();
