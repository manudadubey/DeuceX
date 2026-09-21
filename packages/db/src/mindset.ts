import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Hand-maintained unions for the check constraints on patterns/insights
// (step 1.3 migration), the same idiom notes.ts already uses for
// notes.ctx/mood/round/status.
export type PatternKind = 'mental' | 'physical';
export type PatternConfidence = 'emerging' | 'strong';
export type InsightDelivery = 'delivered' | 'quiet' | 'paused' | 'withheld' | 'failed' | 'distress';
export type InsightFeedback = 'yes' | 'not_today';

export type Pattern = Database['public']['Tables']['patterns']['Row'];
export type Insight = Database['public']['Tables']['insights']['Row'];
export type MindsetBoundaries = Database['public']['Tables']['mindset_boundaries']['Row'];

// Read-only, RLS-scoped: every function below is a direct client query
// (TECH-ARCHITECTURE.md section 1 — no vendor side effect here), matching
// notes.ts. Writing a pattern/insight row from the agent's own run is
// apps/api's job on the service role instead (see
// apps/api/src/mindset-coach/service.ts).

export async function listPatterns(client: SupabaseClient<Database>): Promise<Pattern[]> {
  const { data, error } = await client
    .from('patterns')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// MC-11: dismiss ("Not a pattern") / Undo, both a player-driven toggle of
// the same two columns.
export async function setPatternDismissed(
  client: SupabaseClient<Database>,
  patternId: string,
  dismissed: boolean,
): Promise<Pattern> {
  const { data, error } = await client
    .from('patterns')
    .update({ dismissed, dismissed_at: dismissed ? new Date().toISOString() : null })
    .eq('id', patternId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function setPatternCoachShare(
  client: SupabaseClient<Database>,
  patternId: string,
  coachShare: boolean,
): Promise<Pattern> {
  const { data, error } = await client
    .from('patterns')
    .update({ coach_share: coachShare })
    .eq('id', patternId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

const RECENT_MORNINGS_LIMIT = 14;

// "Recent mornings" (MC-21): the last 14, most recent first.
export async function listRecentInsights(
  client: SupabaseClient<Database>,
  limit = RECENT_MORNINGS_LIMIT,
): Promise<Insight[]> {
  const { data, error } = await client
    .from('insights')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getInsightByDate(
  client: SupabaseClient<Database>,
  date: string,
): Promise<Insight | null> {
  const { data, error } = await client.from('insights').select('*').eq('date', date).maybeSingle();
  if (error) throw error;
  return data;
}

// MC-12: the focus row's checkbox.
export async function setInsightFocusDone(
  client: SupabaseClient<Database>,
  insightId: string,
  focusDone: boolean,
): Promise<Insight> {
  const { data, error } = await client
    .from('insights')
    .update({ focus_done: focusDone, focus_done_at: focusDone ? new Date().toISOString() : null })
    .eq('id', insightId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// MC-13: the Yes / Not today feedback pair.
export async function setInsightFeedback(
  client: SupabaseClient<Database>,
  insightId: string,
  feedback: InsightFeedback,
): Promise<Insight> {
  const { data, error } = await client
    .from('insights')
    .update({ feedback, feedback_at: new Date().toISOString() })
    .eq('id', insightId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

const DEFAULT_BOUNDARIES: Omit<MindsetBoundaries, 'player_id' | 'updated_at'> = {
  quiet_match_mornings: true,
  coach_sees_patterns: true,
  paused_until: null,
};

// No row means the defaults (migration comment on mindset_boundaries):
// both switches on, not paused.
export async function getMindsetBoundaries(
  client: SupabaseClient<Database>,
  playerId: string,
): Promise<MindsetBoundaries> {
  const { data, error } = await client
    .from('mindset_boundaries')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw error;
  return (
    data ?? { player_id: playerId, updated_at: new Date().toISOString(), ...DEFAULT_BOUNDARIES }
  );
}

export interface MindsetBoundariesPatch {
  quietMatchMornings?: boolean;
  coachSeesPatterns?: boolean;
  /** YYYY-MM-DD, or null to resume now (MC-15's "Resume now"). */
  pausedUntil?: string | null;
}

export async function updateMindsetBoundaries(
  client: SupabaseClient<Database>,
  playerId: string,
  patch: MindsetBoundariesPatch,
): Promise<MindsetBoundaries> {
  const row: Database['public']['Tables']['mindset_boundaries']['Insert'] = { player_id: playerId };
  if (patch.quietMatchMornings !== undefined) row.quiet_match_mornings = patch.quietMatchMornings;
  if (patch.coachSeesPatterns !== undefined) row.coach_sees_patterns = patch.coachSeesPatterns;
  if (patch.pausedUntil !== undefined) row.paused_until = patch.pausedUntil;

  const { data, error } = await client
    .from('mindset_boundaries')
    .upsert(row, { onConflict: 'player_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// MC-15: "Pause for a week" from today, in the player's own local calendar.
export function pauseOneWeekFrom(localDate: string): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}
