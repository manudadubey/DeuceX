import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json, NoteCtx, NoteMood } from '@procircuit/db';
import type {
  ExistingPatternWithId,
  GenerateInsightResult,
  MindsetCheckIn,
  MindsetNote,
} from '@procircuit/agents';

const PATTERN_LOOKBACK_DAYS = 90;
const CHECKIN_LOOKBACK_DAYS = 30;
const RECENT_INSIGHTS_FOR_FEEDBACK = 7;
const RECENT_FOCUSES_COUNT = 5;

function daysAgoIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export interface MindsetPlayer {
  id: string;
  timezone: string;
  lang: string;
}

export async function loadMindsetPlayer(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<MindsetPlayer | null> {
  const { data, error } = await db
    .from('players')
    .select('id, timezone, patron_language, app_language')
    .eq('id', playerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // MC-2: the insight is written in the first patron-update language;
  // app_language is the fallback until Preferences (step 2.3) guarantees one.
  return { id: data.id, timezone: data.timezone, lang: data.patron_language ?? data.app_language };
}

// Lifetime saved-note count, for the scheduler's own "starts after your
// third note" gate (onboarding copy, section 2) — distinct from the 30-day
// window MIN_NOTES_FOR_NOTE_BASED_INSIGHT checks inside generate-insight.ts.
export async function countLifetimeSavedNotes(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<number> {
  const { data, error } = await db
    .from('notes')
    .select('id')
    .eq('player_id', playerId)
    .eq('status', 'saved');
  if (error) throw error;
  return data?.length ?? 0;
}

export interface MindsetInputs {
  notes: MindsetNote[];
  checkins: MindsetCheckIn[];
  existingPatterns: ExistingPatternWithId[];
  quietMatchMornings: boolean;
  notTodayCountLast7Days: number;
  recentFocuses: string[];
}

export async function loadMindsetInputs(
  db: SupabaseClient<Database>,
  playerId: string,
  now: Date,
  /** The player's own local date this run is for — excludes that date's own (in-progress) row from history below, so a re-run doesn't see its own prior attempt and hash differently each time. */
  today: string,
): Promise<MindsetInputs> {
  const [notesRes, checkinsRes, patternsRes, boundariesRes, recentInsightsRes] = await Promise.all([
    db
      .from('notes')
      .select('id, recorded_at, ctx, result, mood, tags, transcript, summary, cond')
      .eq('player_id', playerId)
      .neq('status', 'deleted')
      .gte('recorded_at', daysAgoIso(now, PATTERN_LOOKBACK_DAYS)),
    db
      .from('check_ins')
      .select('date, value, sentence')
      .eq('player_id', playerId)
      .gte('date', daysAgoIso(now, CHECKIN_LOOKBACK_DAYS).slice(0, 10)),
    db.from('patterns').select('*').eq('player_id', playerId),
    db.from('mindset_boundaries').select('*').eq('player_id', playerId).maybeSingle(),
    db
      .from('insights')
      .select('feedback, focus, date')
      .eq('player_id', playerId)
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(RECENT_INSIGHTS_FOR_FEEDBACK),
  ]);
  if (notesRes.error) throw notesRes.error;
  if (checkinsRes.error) throw checkinsRes.error;
  if (patternsRes.error) throw patternsRes.error;
  if (boundariesRes.error) throw boundariesRes.error;
  if (recentInsightsRes.error) throw recentInsightsRes.error;

  const notes: MindsetNote[] = (notesRes.data ?? []).map((n) => ({
    id: n.id,
    recordedAt: n.recorded_at,
    ctx: n.ctx as NoteCtx,
    result: n.result,
    mood: n.mood as NoteMood | null,
    tags: Array.isArray(n.tags) ? (n.tags as string[]) : [],
    transcript: n.transcript,
    summary: n.summary,
    // notes.cond is PRD-08's own stamp shape as of step 3.3 (a string[] —
    // see packages/agents/src/conditions/stamp.ts), not this module's
    // MindsetConditionStamp{firstServePct, tempC, humidityPct} (a step-1.3
    // placeholder written before PRD-08 existed, and the stamp never
    // carried a performance metric to begin with). Always null here rather
    // than a lossy cast of the wrong shape — detectConditionsFirstServe
    // stays exercised only by its own fixture test, as it already was;
    // see rules.ts's own updated comment and docs/BUILD-LOG.md's step 3.3
    // entry for the named gap (no first-serve-percentage extraction exists
    // anywhere in this pipeline yet).
    cond: null,
  }));

  const checkins: MindsetCheckIn[] = (checkinsRes.data ?? []).map((c) => ({
    date: c.date,
    value: c.value as MindsetCheckIn['value'],
    sentence: c.sentence,
  }));

  const existingPatterns: ExistingPatternWithId[] = (patternsRes.data ?? []).map((p) => ({
    id: p.id,
    ruleKey: p.rule_key,
    statement: p.statement,
    explanation: p.explanation,
    evidence: Array.isArray(p.evidence)
      ? (p.evidence as unknown as ExistingPatternWithId['evidence'])
      : [],
    confidence: p.confidence as ExistingPatternWithId['confidence'],
    dismissed: p.dismissed,
    recurSince: p.recur_since,
  }));

  const recentInsights = recentInsightsRes.data ?? [];
  const notTodayCountLast7Days = recentInsights.filter((i) => i.feedback === 'not_today').length;
  const recentFocuses = recentInsights
    .map((i) => i.focus)
    .filter((f): f is string => Boolean(f))
    .slice(0, RECENT_FOCUSES_COUNT);

  return {
    notes,
    checkins,
    existingPatterns,
    quietMatchMornings: boundariesRes.data?.quiet_match_mornings ?? true,
    notTodayCountLast7Days,
    recentFocuses,
  };
}

export async function getExistingInsightHash(
  db: SupabaseClient<Database>,
  playerId: string,
  date: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('insights')
    .select('inputs_hash')
    .eq('player_id', playerId)
    .eq('date', date)
    .maybeSingle();
  if (error) throw error;
  return data?.inputs_hash ?? null;
}

export interface WriteMindsetOutputInput {
  playerId: string;
  date: string;
  lang: string;
  inputsHash: string;
  result: GenerateInsightResult;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  costAmount: number | null;
  costCurrency: string | null;
}

// Upserts every pattern this run touched (by rule_key, matching the
// migration's unique constraint), returning the flagged pattern's row id so
// the insight row below can set pattern_flag as a real FK, then writes the
// one insights row for the day.
export async function writeMindsetOutput(
  db: SupabaseClient<Database>,
  input: WriteMindsetOutputInput,
): Promise<{ insightId: string }> {
  let patternFlagId: string | null = null;

  for (const update of input.result.patternUpdates) {
    const { data, error } = await db
      .from('patterns')
      .upsert(
        {
          player_id: input.playerId,
          rule_key: update.ruleKey,
          kind: update.kind,
          tag: update.tag,
          statement: update.statement,
          explanation: update.explanation,
          evidence: update.evidence as unknown as Json,
          confidence: update.confidence,
          dismissed: update.dismissed,
          dismissed_at: update.dismissed ? new Date().toISOString() : null,
          recur_since: update.recurSince,
        },
        { onConflict: 'player_id,rule_key' },
      )
      .select('id, rule_key')
      .single();
    if (error) throw error;
    if (input.result.patternFlagRuleKey === update.ruleKey) patternFlagId = data.id;
  }

  const { data: insight, error } = await db
    .from('insights')
    .upsert(
      {
        player_id: input.playerId,
        date: input.date,
        lang: input.lang,
        inputs_hash: input.inputsHash,
        provenance: input.result.provenance as unknown as Json,
        body: input.result.body as unknown as Json,
        focus: input.result.focus,
        pattern_flag: patternFlagId,
        delivery: input.result.delivery,
        tone_check: input.result.toneCheck as unknown as Json,
        distress: input.result.distress as unknown as Json,
        model: input.model,
        prompt_version: input.promptVersion,
        schema_version: input.schemaVersion,
        cost_amount: input.costAmount,
        cost_currency: input.costCurrency,
      },
      { onConflict: 'player_id,date' },
    )
    .select('id')
    .single();
  if (error) throw error;

  return { insightId: insight.id };
}

// M-NOTIF-1: at most one notification per run.
export async function sendMindsetNotification(
  db: SupabaseClient<Database>,
  playerId: string,
  body: string,
): Promise<void> {
  const { error } = await db.from('notifications').insert({
    player_id: playerId,
    agent: 'mindset-coach',
    category: 'fyi',
    title: "This morning's insight is ready",
    body,
    action_href: '/agent/mindset',
  });
  if (error) throw error;
}

// M-PRIV-3/MC-16: opens a case in the admin data model, structurally
// separate from anything a player or their own session can read (see the
// migration's design note on cases).
export async function openDistressCase(
  db: SupabaseClient<Database>,
  playerId: string,
  signals: readonly string[],
): Promise<void> {
  const { error } = await db.from('cases').insert({
    kind: 'distress',
    player_id: playerId,
    opened_by_rule: 'mindset-coach-distress-rule',
    excerpt: `Signals: ${signals.join(', ')}`,
  });
  if (error) throw error;
}
