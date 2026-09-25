import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';

// PRD-13 AD-21: calendar events with no published deadline, and setting
// one. Shared by the console's ingestion routes (admin-routes.ts) and the
// admin MCP server (step 5.0), so both show the same count and write the
// same sentence. The platform's service client does the work here, as it
// did in step 3.1: the console role has no grant on shortlist_candidates.

export class DeadlineError extends Error {
  constructor(
    readonly status: 400 | 404 | 500,
    message: string,
  ) {
    super(message);
    this.name = 'DeadlineError';
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function listMissingDeadlines(db: SupabaseClient<Database>) {
  const { data, error } = await db
    .from('tournaments')
    .select('id, tour, name, start_date, city, country')
    .is('entry_deadline', null)
    .order('start_date', { ascending: true });
  if (error) throw new DeadlineError(500, error.message);
  const ids = (data ?? []).map((t) => t.id);
  const counts = new Map<string, Set<string>>();
  if (ids.length) {
    const { data: shortlisted, error: countError } = await db
      .from('shortlist_candidates')
      .select('tournament_id, player_id')
      .in('tournament_id', ids);
    if (countError) throw new DeadlineError(500, countError.message);
    for (const row of shortlisted ?? []) {
      const set = counts.get(row.tournament_id) ?? new Set<string>();
      set.add(row.player_id);
      counts.set(row.tournament_id, set);
    }
  }
  return (data ?? []).map((t) => ({ ...t, shortlistedCount: counts.get(t.id)?.size ?? 0 }));
}

export function deadlineConsequence(
  tournamentName: string | null,
  entryDeadline: string,
  players: number,
): string {
  const event = tournamentName ? `${tournamentName}'s` : 'the';
  return `Set ${event} entry deadline to ${entryDeadline}; countdowns start and ${players} player${players === 1 ? "'s" : "s'"} shortlists re-run.`;
}

/** The consequence of setting a deadline, from the event and how many players shortlisted it. */
export async function previewEntryDeadline(
  db: SupabaseClient<Database>,
  tournamentId: string,
  entryDeadline: string,
): Promise<string> {
  if (!ISO_DAY.test(entryDeadline) || Number.isNaN(Date.parse(entryDeadline))) {
    throw new DeadlineError(400, 'Give the deadline as a date, YYYY-MM-DD.');
  }
  const { data: event, error } = await db
    .from('tournaments')
    .select('name')
    .eq('id', tournamentId)
    .maybeSingle();
  if (error) throw new DeadlineError(500, error.message);
  if (!event) throw new DeadlineError(404, 'No such tournament.');
  const { data: shortlisted, error: countError } = await db
    .from('shortlist_candidates')
    .select('player_id')
    .eq('tournament_id', tournamentId);
  if (countError) throw new DeadlineError(500, countError.message);
  const players = new Set((shortlisted ?? []).map((r) => r.player_id)).size;
  return deadlineConsequence(event.name, entryDeadline, players);
}

/** Writes the deadline and re-runs the shortlists (AD-20, AD-21); returns how many re-ran. */
export async function setEntryDeadline(
  db: SupabaseClient<Database>,
  rerunShortlists: ((tournamentId: string) => Promise<number>) | undefined,
  tournamentId: string,
  entryDeadline: string,
): Promise<number> {
  const { error } = await db
    .from('tournaments')
    .update({ entry_deadline: entryDeadline, updated_at: new Date().toISOString() })
    .eq('id', tournamentId);
  if (error) throw new DeadlineError(500, error.message);
  return (await rerunShortlists?.(tournamentId)) ?? 0;
}
