import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type EntryDecision = Database['public']['Tables']['entry_decisions']['Row'];
export type EntryDecisionStatus = EntryDecision['status'];
export type ShortlistCandidateRow = Database['public']['Tables']['shortlist_candidates']['Row'];

export async function listShortlistCandidates(
  client: SupabaseClient<Database>,
  playerId: string,
): Promise<ShortlistCandidateRow[]> {
  const { data, error } = await client
    .from('shortlist_candidates')
    .select('*')
    .eq('player_id', playerId)
    .order('rank', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listEntryDecisions(
  client: SupabaseClient<Database>,
  playerId: string,
): Promise<EntryDecision[]> {
  const { data, error } = await client
    .from('entry_decisions')
    .select('*')
    .eq('player_id', playerId);
  if (error) throw error;
  return data;
}

// PRD-01 T-10: "Skip sets status Skipped... offers Undo until the next
// run." Both are plain, RLS-scoped writes the player's own session can make
// directly (entry_decisions_update_own's WITH CHECK in the step 3.2
// migration only ever admits status none<->skipped) — Accept entry and
// Withdraw are the two transitions that need the actions-module gate
// (packages/actions' confirmEntry/withdrawEntry), not these.
export async function skipCandidate(
  client: SupabaseClient<Database>,
  input: { tournamentId: string; playerId: string; device?: string | null },
): Promise<void> {
  const { error } = await client
    .from('entry_decisions')
    .update({
      status: 'skipped',
      decided_at: new Date().toISOString(),
      device: input.device ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('tournament_id', input.tournamentId)
    .eq('player_id', input.playerId)
    .eq('status', 'none');
  if (error) throw error;
}

export async function undoSkip(
  client: SupabaseClient<Database>,
  input: { tournamentId: string; playerId: string },
): Promise<void> {
  const { error } = await client
    .from('entry_decisions')
    .update({
      status: 'none',
      decided_at: null,
      device: null,
      updated_at: new Date().toISOString(),
    })
    .eq('tournament_id', input.tournamentId)
    .eq('player_id', input.playerId)
    .eq('status', 'skipped');
  if (error) throw error;
}
