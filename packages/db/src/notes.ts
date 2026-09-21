import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.types';

// The check constraints on notes.ctx/mood/round/status (see the step 1.1
// migration). Supabase's generated types don't reflect CHECK constraints as
// literal unions, so these are hand-maintained the same way
// approvals.ApprovalActionType already is: extending any of them is the same
// additive migration the migration's own comments describe, plus this line.
export type NoteCtx = 'match' | 'practice' | 'travel' | 'other';
export type NoteMood = 'frustrated' | 'flat' | 'confident' | 'energised';
export type NoteRound = 'Q1' | 'Q2' | 'Q3' | 'R1' | 'R2' | 'R3' | 'QF' | 'SF' | 'F';
export type NoteStatus =
  | 'queued'
  | 'uploaded'
  | 'transcribing'
  | 'review'
  | 'saved'
  | 'failed_transcription'
  | 'failed_extraction'
  | 'deleted';

export type Note = Database['public']['Tables']['notes']['Row'];
export type CheckIn = Database['public']['Tables']['check_ins']['Row'];

// The initial tag vocabulary a player starts with (PRD-02 S-10); the player
// can add to it, and future notes' `tags` values are not restricted to this
// list here — this is only used below to let a text search also match a
// note by a tag name (S-17: "search across transcript, result and tags").
export const INITIAL_TAG_VOCABULARY = [
  'Second serve',
  'Tiebreak',
  'Clay',
  'Fitness',
  'Travel',
  'Sleep',
  'Routine',
  'First serve',
  'Heat',
] as const;

export interface ListNotesFilter {
  ctx?: NoteCtx;
  /** Case-insensitive substring match across transcript, result, opponent and tags (S-17). */
  search?: string;
  /** Past-notes window in days; PRD-02 section 4.5 shows the last 30. */
  sinceDays?: number;
  /** Extra tag names to treat as searchable, beyond INITIAL_TAG_VOCABULARY (a player's own additions). */
  knownTags?: readonly string[];
}

function escapeIlike(value: string): string {
  return value.replace(/[%_,]/g, (char) => `\\${char}`);
}

// Read-only history (S-17): a direct RLS-scoped client query, per
// TECH-ARCHITECTURE.md section 1's "Next.js server actions handle simple
// CRUD directly against the database" — nothing here has a vendor side
// effect. Notes with status 'deleted' (S-14's soft delete) are always
// excluded: that status is exactly what "agents lose it too" needs to also
// hold for the player's own history view.
export async function listNotes(
  client: SupabaseClient<Database>,
  filter: ListNotesFilter = {},
): Promise<Note[]> {
  const sinceDays = filter.sinceDays ?? 30;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  let query = client
    .from('notes')
    .select('*')
    .neq('status', 'deleted')
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: false });

  if (filter.ctx) {
    query = query.eq('ctx', filter.ctx);
  }

  if (filter.search && filter.search.trim().length > 0) {
    const needle = filter.search.trim();
    const escaped = escapeIlike(needle);
    const vocabulary = [...INITIAL_TAG_VOCABULARY, ...(filter.knownTags ?? [])];
    const matchingTags = vocabulary.filter((tag) =>
      tag.toLowerCase().includes(needle.toLowerCase()),
    );

    const clauses = [
      `transcript.ilike.%${escaped}%`,
      `result.ilike.%${escaped}%`,
      `opponent.ilike.%${escaped}%`,
      ...matchingTags.map((tag) => `tags.cs.${JSON.stringify([tag])}`),
    ];
    query = query.or(clauses.join(','));
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getNote(
  client: SupabaseClient<Database>,
  noteId: string,
): Promise<Note | null> {
  const { data, error } = await client.from('notes').select('*').eq('id', noteId).maybeSingle();
  if (error) throw error;
  return data;
}

export interface NoteContentPatch {
  ctx?: NoteCtx;
  transcript?: string;
  result?: string | null;
  opponent?: string | null;
  round?: NoteRound | null;
  surface?: string | null;
  tags?: string[];
  mood?: NoteMood | null;
  summary?: string | null;
  coachShare?: boolean;
}

// The review-state edits a player makes by hand (S-6, S-8): everything here
// is a column the notes_update_own RLS policy and its column grant allow an
// authenticated player to write directly (see the step 1.1 migrations).
// Anything that changes `status` or touches audio goes through apps/api
// instead, which is the only thing that can (the grant was deliberately
// narrowed to exclude both — see 20260921093000_step_1_1_notes_grant_no_status.sql).
export async function updateNoteContent(
  client: SupabaseClient<Database>,
  noteId: string,
  patch: NoteContentPatch,
): Promise<Note> {
  const row: Database['public']['Tables']['notes']['Update'] = {};
  if (patch.ctx !== undefined) row.ctx = patch.ctx;
  if (patch.transcript !== undefined) row.transcript = patch.transcript;
  if (patch.result !== undefined) row.result = patch.result;
  if (patch.opponent !== undefined) row.opponent = patch.opponent;
  if (patch.round !== undefined) row.round = patch.round;
  if (patch.surface !== undefined) row.surface = patch.surface;
  if (patch.tags !== undefined) row.tags = patch.tags as Json;
  if (patch.mood !== undefined) row.mood = patch.mood;
  if (patch.summary !== undefined) row.summary = patch.summary;
  if (patch.coachShare !== undefined) row.coach_share = patch.coachShare;

  const { data, error } = await client
    .from('notes')
    .update(row)
    .eq('id', noteId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// The Free-tier quota (S-16): how many notes the calling player has saved
// this local calendar month, via notes_saved_this_month() — auth.uid()-
// scoped inside the function itself (see the step 1.1 fix migration), so
// this can only ever answer for the signed-in player, never another one.
export async function getSavedNotesThisMonth(client: SupabaseClient<Database>): Promise<number> {
  const { data, error } = await client.rpc('notes_saved_this_month');
  if (error) throw error;
  return data ?? 0;
}

export const FREE_TIER_MONTHLY_NOTE_LIMIT = 10;

// Read-only, RLS-scoped (Mindset Coach's mood chart, MC-6): the player's own
// check-ins over a window, most recent first.
export async function listCheckIns(
  client: SupabaseClient<Database>,
  sinceDays = 90,
): Promise<CheckIn[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await client
    .from('check_ins')
    .select('*')
    .gte('date', since)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

export interface SaveCheckInInput {
  playerId: string;
  /** Player's local calendar date, YYYY-MM-DD. */
  date: string;
  value: 1 | 2 | 3 | 4 | 5;
  sentence?: string | null;
  source: 'scribe' | 'dashboard' | 'mindset';
}

// One check-in per player per local day (S-4.4): a second save the same day
// replaces the first via the unique (player_id, date) index rather than
// adding a row.
//
// This is an update-then-insert-if-missing, not `.upsert()`: PostgREST's
// upsert issues `INSERT ... ON CONFLICT (player_id, date) DO UPDATE SET
// <every column in the payload>`, which includes `player_id` and `date`
// themselves even though their values never actually change on a same-day
// re-save — and the step 1.1 migration deliberately never grants
// `authenticated` UPDATE on those two columns (only `value`, `sentence`,
// `source`), the same narrowing notes.ts's own updateNoteContent relies on
// elsewhere. An upsert therefore fails with "permission denied for table
// check_ins" the moment a real player saves a second check-in on the same
// day — caught live against the production project while verifying step
// 1.3's mood check-in card, not by inspection. Two real statements instead:
// try the update first (the common case, since MC-5's whole point is a
// later save replacing the earlier one), and only insert when no row for
// today existed yet.
export async function saveCheckIn(
  client: SupabaseClient<Database>,
  input: SaveCheckInInput,
): Promise<CheckIn> {
  const patch = {
    value: input.value,
    sentence: input.sentence ?? null,
    source: input.source,
  };

  const { data: updated, error: updateError } = await client
    .from('check_ins')
    .update(patch)
    .eq('player_id', input.playerId)
    .eq('date', input.date)
    .select('*');
  if (updateError) throw updateError;
  if (updated && updated.length > 0) return updated[0]!;

  const { data: inserted, error: insertError } = await client
    .from('check_ins')
    .insert({ player_id: input.playerId, date: input.date, ...patch })
    .select('*')
    .single();
  if (insertError) throw insertError;
  return inserted;
}
