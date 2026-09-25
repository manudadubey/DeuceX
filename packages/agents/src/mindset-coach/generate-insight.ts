import { AgentValidationError, type TokenUsage } from '@deucex/actions';
import { evaluateDistress, type DistressEvaluation } from './distress';
import { mergePattern, type ExistingPattern, type PatternMergeResult } from './merge-patterns';
import { detectPatterns } from './rules';
import type { MindsetCheckIn, MindsetNote } from './types';
import {
  buildCorrectiveInsightPrompt,
  buildInsightPrompt,
  buildToneRetryPrompt,
  type InsightPromptNote,
} from './prompt';
import { insightModelOutputSchema, runToneCheck } from './schema';
import type { InsightModelClient } from './model-client';

// The minimum a Match note needs to count as "in the window" for the
// check-ins-only fallback (section 3). Notes outside the last 30 days don't
// count toward this even though patterns look back 90 (see rules.ts).
const RECENT_NOTES_WINDOW_DAYS = 30;
const MIN_NOTES_FOR_NOTE_BASED_INSIGHT = 3;
const AFTER_HOURS_LOCAL_HOUR = 23;

export interface ExistingPatternWithId extends ExistingPattern {
  id: string;
  ruleKey: string;
}

export interface GenerateInsightInput {
  lang: string;
  timezone: string;
  /** Up to 90 days back — rules.ts's own window is what actually bounds pattern detection. */
  notes: readonly MindsetNote[];
  /** Last 30 days (PRD-06 section 3's stated input window). */
  checkins: readonly MindsetCheckIn[];
  existingPatterns: readonly ExistingPatternWithId[];
  quietMatchMornings: boolean;
  /** Tournament Agent input (step 3.2); always false until it exists. */
  hasMatchToday: boolean;
  /** Section 7's feedback-adaptation rule: 3 in a rolling 7 days switches the prompt. */
  notTodayCountLast7Days: number;
  recentFocuses: readonly string[];
  now: Date;
}

export interface InsightProvenance {
  notes: number;
  checkins: number;
  /** Deferred to step 3.1 (ranking_snapshots doesn't exist yet). */
  rankingDelta: null;
  /** Deferred to step 3.2 (entry_decisions/tournaments don't exist yet). */
  nextEvent: null;
  daysToEvent: null;
}

export type InsightDelivery = 'delivered' | 'quiet' | 'withheld' | 'distress';

export interface GenerateInsightResult {
  delivery: InsightDelivery;
  provenance: InsightProvenance;
  body: string[] | null;
  focus: string | null;
  patternFlagRuleKey: string | null;
  patternUpdates: (PatternMergeResult & { existingId: string | null })[];
  toneCheck: { passed: boolean; flaggedTerms: string[] } | null;
  distress: DistressEvaluation | null;
  usage: TokenUsage | null;
  notify: boolean;
  notificationBody: string | null;
}

function recentNotes(notes: readonly MindsetNote[], now: Date, windowDays: number): MindsetNote[] {
  const ms = windowDays * 24 * 60 * 60 * 1000;
  return notes.filter((n) => now.getTime() - new Date(n.recordedAt).getTime() <= ms);
}

function localHour(iso: string, timezone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(
      new Date(iso),
    ),
  );
}

// MC-17 / section 7 "Light mornings": yesterday's notes include Travel, or
// today's first check-in is <=2, or a note was logged after 23:00 local.
function isLightMorning(
  recent: readonly MindsetNote[],
  checkins: readonly MindsetCheckIn[],
  timezone: string,
  now: Date,
): boolean {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const hadYesterdayTravelNote = recent.some(
    (n) => n.ctx === 'travel' && new Date(n.recordedAt).toDateString() === yesterday.toDateString(),
  );
  const sortedCheckins = [...checkins].sort((a, b) => b.date.localeCompare(a.date));
  const todaysFirstCheckIn = sortedCheckins[0];
  const lowCheckIn = todaysFirstCheckIn !== undefined && todaysFirstCheckIn.value <= 2;
  const loggedAfterHours = recent.some(
    (n) => localHour(n.recordedAt, timezone) >= AFTER_HOURS_LOCAL_HOUR,
  );
  return hadYesterdayTravelNote || lowCheckIn || loggedAfterHours;
}

const FEEDBACK_ADAPTATION_THRESHOLD = 3;

function mergeAllPatterns(
  candidates: ReturnType<typeof detectPatterns>,
  existing: readonly ExistingPatternWithId[],
): (PatternMergeResult & { existingId: string | null })[] {
  const byRuleKey = new Map(existing.map((p) => [p.ruleKey, p]));
  return candidates.map((candidate) => {
    const existingRow = byRuleKey.get(candidate.ruleKey);
    const merged = mergePattern(candidate, existingRow);
    return { ...merged, existingId: existingRow?.id ?? null };
  });
}

async function completeWithRetries(
  client: InsightModelClient,
  buildInitial: () => ReturnType<typeof buildInsightPrompt>,
  buildCorrective: (error: string) => ReturnType<typeof buildCorrectiveInsightPrompt>,
): Promise<{ output: { body: string[]; focus: string | null }; usage: TokenUsage }> {
  const first = await client.complete(buildInitial());
  const firstParsed = insightModelOutputSchema.safeParse(first.raw);
  if (firstParsed.success) return { output: firstParsed.data, usage: first.usage };

  const second = await client.complete(buildCorrective(firstParsed.error.message));
  const usage: TokenUsage = {
    inputTokens: first.usage.inputTokens + second.usage.inputTokens,
    outputTokens: first.usage.outputTokens + second.usage.outputTokens,
  };
  const secondParsed = insightModelOutputSchema.safeParse(second.raw);
  if (secondParsed.success) return { output: secondParsed.data, usage };

  throw new AgentValidationError(
    `mindset-coach/generate-insight: model output failed schema validation twice: ${secondParsed.error.message}`,
  );
}

// The daily run (PRD-06 section 3/7), given a full point-in-time input
// bundle. Caching on the input hash (MC-1) is the caller's job (apps/api),
// which decides whether to invoke this at all for a given day — this
// function always computes a fresh result. Pause (MC-15) is also the
// caller's job: a paused player is never invoked at all (see the migration's
// design note on mindset_boundaries for why that boundary lives outside
// this function).
export async function generateInsight(
  client: InsightModelClient,
  input: GenerateInsightInput,
): Promise<GenerateInsightResult> {
  const recent = recentNotes(input.notes, input.now, RECENT_NOTES_WINDOW_DAYS);
  const provenance: InsightProvenance = {
    notes: recent.length,
    checkins: input.checkins.length,
    rankingDelta: null,
    nextEvent: null,
    daysToEvent: null,
  };

  // M-PRIV-3: evaluated first and unconditionally. A fired distress rule
  // pre-empts everything else — no insight, no pattern update, no coach-link
  // content this run.
  const distress = evaluateDistress({ notes: input.notes, checkins: input.checkins });
  if (distress.fired) {
    return {
      delivery: 'distress',
      provenance,
      body: null,
      focus: null,
      patternFlagRuleKey: null,
      patternUpdates: [],
      toneCheck: null,
      distress,
      usage: null,
      notify: true,
      notificationBody: 'Something for you this morning',
    };
  }

  // MC-14: quiet on a match morning. Patterns still aren't computed or
  // flagged this run — the eventual evening-note trigger (not built by this
  // step; see build log) is what would produce a real insight for the day.
  if (input.hasMatchToday && input.quietMatchMornings) {
    return {
      delivery: 'quiet',
      provenance,
      body: null,
      focus: null,
      patternFlagRuleKey: null,
      patternUpdates: [],
      toneCheck: null,
      distress,
      usage: null,
      notify: false,
      notificationBody: null,
    };
  }

  const candidates = detectPatterns({
    notes: input.notes,
    timezone: input.timezone,
    now: input.now,
  });
  const patternUpdates = mergeAllPatterns(candidates, input.existingPatterns);
  const flagged = patternUpdates.find((p) => p.isNewOrStrengthened);

  const checkinsOnly = recent.length < MIN_NOTES_FOR_NOTE_BASED_INSIGHT;
  const light = isLightMorning(recent, input.checkins, input.timezone, input.now);
  const adapted = input.notTodayCountLast7Days >= FEEDBACK_ADAPTATION_THRESHOLD;

  const promptNotes: InsightPromptNote[] = recent.map((n) => ({
    date: n.recordedAt.slice(0, 10),
    ctx: n.ctx,
    mood: n.mood,
    result: n.result,
    summary: n.summary,
  }));
  const promptInput = {
    lang: input.lang,
    notes: promptNotes,
    checkins: input.checkins.map((c) => ({ date: c.date, value: c.value, sentence: c.sentence })),
    patternFlagStatement: light ? null : (flagged?.statement ?? null),
    light,
    checkinsOnly,
    adapted,
    recentFocuses: input.recentFocuses,
  };

  const { output, usage: firstUsage } = await completeWithRetries(
    client,
    () => buildInsightPrompt(promptInput),
    (error) => buildCorrectiveInsightPrompt(promptInput, error),
  );

  const toneCheck = runToneCheck(output);
  if (toneCheck.passed) {
    return {
      delivery: 'delivered',
      provenance,
      body: output.body,
      focus: output.focus,
      patternFlagRuleKey: light ? null : (flagged?.ruleKey ?? null),
      patternUpdates,
      toneCheck,
      distress,
      usage: firstUsage,
      notify: true,
      notificationBody: output.body[0] ?? null,
    };
  }

  // AC-11: exactly one tone-check retry, then withheld.
  const retryPrompt = buildToneRetryPrompt(promptInput, toneCheck.flaggedTerms);
  const retry = await client.complete(retryPrompt);
  const retryParsed = insightModelOutputSchema.safeParse(retry.raw);
  const combinedUsage: TokenUsage = {
    inputTokens: firstUsage.inputTokens + retry.usage.inputTokens,
    outputTokens: firstUsage.outputTokens + retry.usage.outputTokens,
  };

  const retryToneCheck = retryParsed.success
    ? runToneCheck(retryParsed.data)
    : { passed: false, flaggedTerms: toneCheck.flaggedTerms };
  if (retryParsed.success && retryToneCheck.passed) {
    return {
      delivery: 'delivered',
      provenance,
      body: retryParsed.data.body,
      focus: retryParsed.data.focus,
      patternFlagRuleKey: light ? null : (flagged?.ruleKey ?? null),
      patternUpdates,
      toneCheck: retryToneCheck,
      distress,
      usage: combinedUsage,
      notify: true,
      notificationBody: retryParsed.data.body[0] ?? null,
    };
  }

  return {
    delivery: 'withheld',
    provenance,
    body: null,
    focus: null,
    patternFlagRuleKey: null,
    patternUpdates,
    toneCheck: retryToneCheck,
    distress,
    usage: combinedUsage,
    notify: false,
    notificationBody: null,
  };
}
