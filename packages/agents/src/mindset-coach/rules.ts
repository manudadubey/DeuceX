import type { MindsetConditionStamp, MindsetNote } from './types';

export type { MindsetConditionStamp, MindsetNote } from './types';

// PRD-06 section 7's three worked examples read like open-ended text mining
// ("after a tiebreak loss, you write about rushing the second serve"), but
// the fields they actually key off — result grammar, tags, ctx, mood — are
// exactly the structured columns step 1.2's extractor already fills in. This
// module is therefore a small, fixed catalogue of deterministic rules over
// those columns, not a semantic clustering pipeline: cheaper, auditable, and
// testable without a model in the loop. The generative model (generate-
// insight.ts) only ever writes the morning's prose; it never invents a
// pattern statement.

export const PATTERN_MIN_HITS = 3;
// worksheet 17 / PRD-06 section 7: the Strong ratio (0.6) is itself a
// placeholder pending real-usage review, same status as the mood-confidence
// floor in match-scribe/schema.ts.
export const PATTERN_STRONG_RATIO = 0.6;
export const PATTERN_WINDOW_DAYS = 90;

export type PatternKind = 'mental' | 'physical';

export interface PatternEvidenceEntry {
  noteId: string;
  hit: boolean;
}

export interface PatternCandidate {
  ruleKey: string;
  kind: PatternKind;
  tag: string;
  statement: string;
  explanation: string;
  evidence: PatternEvidenceEntry[];
}

export type PatternConfidence = 'emerging' | 'strong';

export function computeConfidence(evidence: readonly PatternEvidenceEntry[]): PatternConfidence {
  const hits = evidence.filter((e) => e.hit).length;
  return hits / evidence.length >= PATTERN_STRONG_RATIO ? 'strong' : 'emerging';
}

function withinWindow(recordedAt: string, now: Date, windowDays: number): boolean {
  const ms = windowDays * 24 * 60 * 60 * 1000;
  return now.getTime() - new Date(recordedAt).getTime() <= ms;
}

// A losing set decided by tiebreak, e.g. "L 6-4 3-6 6-7(5)" (the grammar
// match-scribe/schema.ts's RESULT_GRAMMAR already enforces on the column).
function isTiebreakLoss(result: string | null): boolean {
  if (!result) return false;
  return result.startsWith('L') && result.includes('(');
}

// PRD-06 section 7's first worked example.
function detectTiebreakSecondServe(
  notes: readonly MindsetNote[],
  now: Date,
): PatternCandidate | null {
  const candidates = notes.filter(
    (n) =>
      n.ctx === 'match' &&
      withinWindow(n.recordedAt, now, PATTERN_WINDOW_DAYS) &&
      isTiebreakLoss(n.result),
  );
  if (candidates.length === 0) return null;

  return {
    ruleKey: 'tiebreak_loss_second_serve',
    kind: 'mental',
    tag: 'Second serve',
    statement: 'After a tiebreak loss, you write about rushing the second serve',
    explanation: 'Counted across your match notes where you lost a set in a tiebreak.',
    evidence: candidates.map((n) => ({ noteId: n.id, hit: n.tags.includes('Second serve') })),
  };
}

function localDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(iso));
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// PRD-06 section 7's second worked example. "The day after" is the player's
// own local calendar day, matching how notes_saved_this_month (step 1.1)
// already scopes a month boundary to players.timezone rather than UTC.
function detectTravelFlat(
  notes: readonly MindsetNote[],
  now: Date,
  timezone: string,
): PatternCandidate | null {
  const inWindow = notes.filter((n) => withinWindow(n.recordedAt, now, PATTERN_WINDOW_DAYS));
  const travelDates = new Set(
    inWindow.filter((n) => n.ctx === 'travel').map((n) => localDate(n.recordedAt, timezone)),
  );
  if (travelDates.size === 0) return null;

  const candidates = inWindow.filter((n) =>
    travelDates.has(addDays(localDate(n.recordedAt, timezone), -1)),
  );
  if (candidates.length === 0) return null;

  return {
    ruleKey: 'travel_next_day_flat',
    kind: 'mental',
    tag: 'Travel',
    statement: "The day after travel, you're flat",
    explanation: 'Counted across notes logged the calendar day after a Travel note.',
    evidence: candidates.map((n) => ({ noteId: n.id, hit: n.mood === 'flat' })),
  };
}

// A stamp counts as a "hot" condition worth comparing against baseline.
// Placeholder thresholds: PRD-08 (step 3.3) owns the real amber predicate
// ("the forecast maximum of 28°C or 70 percent humidity", Baseline's own
// conditions brief) — this rule exists so the "Conditions" pattern kind is
// structurally real ahead of that step, the same "wire it, defer the real
// numbers" pattern step 1.1/1.2 already used for the cond column itself.
// cond is always null until PRD-08 ships, so this never actually fires in
// production yet; it is exercised only by this package's own fixture test.
const HOT_TEMP_C = 30;
const HOT_HUMIDITY_PCT = 80;
const FIRST_SERVE_DROP_THRESHOLD_PCT = 10;

function detectConditionsFirstServe(
  notes: readonly MindsetNote[],
  now: Date,
): PatternCandidate | null {
  const stamped = notes.filter(
    (n): n is MindsetNote & { cond: MindsetConditionStamp } =>
      n.cond !== null && withinWindow(n.recordedAt, now, PATTERN_WINDOW_DAYS),
  );
  const baselineNotes = stamped.filter(
    (n) => n.cond.tempC < HOT_TEMP_C && n.cond.humidityPct < HOT_HUMIDITY_PCT,
  );
  const hotNotes = stamped.filter(
    (n) => n.cond.tempC >= HOT_TEMP_C || n.cond.humidityPct >= HOT_HUMIDITY_PCT,
  );
  if (baselineNotes.length === 0 || hotNotes.length === 0) return null;

  const baselinePct =
    baselineNotes.reduce((sum, n) => sum + n.cond.firstServePct, 0) / baselineNotes.length;
  const maxTemp = Math.max(...hotNotes.map((n) => n.cond.tempC));
  const maxHumidity = Math.max(...hotNotes.map((n) => n.cond.humidityPct));
  const hotAvgPct = Math.round(
    hotNotes.reduce((sum, n) => sum + n.cond.firstServePct, 0) / hotNotes.length,
  );

  return {
    ruleKey: 'conditions_first_serve_drop',
    kind: 'physical',
    tag: 'Conditions',
    statement: `${hotAvgPct}% first serves at ${maxTemp}°C and ${maxHumidity}% humidity`,
    explanation: `Built from the condition stamps on your notes: first-serve percentage against ${Math.round(baselinePct)}% in cooler, drier conditions.`,
    evidence: hotNotes.map((n) => ({
      noteId: n.id,
      hit: baselinePct - n.cond.firstServePct >= FIRST_SERVE_DROP_THRESHOLD_PCT,
    })),
  };
}

export interface DetectPatternsInput {
  notes: readonly MindsetNote[];
  timezone: string;
  now: Date;
}

// MC-7: "A mental pattern exists only when at least three notes within 90
// days support it." Below three hits, a candidate simply doesn't exist yet
// (nothing is returned, not an Emerging-confidence row) — see also
// merge-patterns.ts for what happens to a candidate that already exists as
// a pattern and later drops below three hits.
export function detectPatterns(input: DetectPatternsInput): PatternCandidate[] {
  const candidates = [
    detectTiebreakSecondServe(input.notes, input.now),
    detectTravelFlat(input.notes, input.now, input.timezone),
    detectConditionsFirstServe(input.notes, input.now),
  ].filter((c): c is PatternCandidate => c !== null);

  return candidates.filter((c) => c.evidence.filter((e) => e.hit).length >= PATTERN_MIN_HITS);
}
