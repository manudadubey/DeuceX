import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type RankingSnapshot = Database['public']['Tables']['ranking_snapshots']['Row'];
export type Tournament = Database['public']['Tables']['tournaments']['Row'];
export type FeedStatus = Database['public']['Tables']['feed_status']['Row'];
export type FactCorrection = Database['public']['Tables']['fact_corrections']['Row'];

// M-STG-4: "the doubles ranking on the player's tour is stored with each
// snapshot and shown as a chip beside singles when inside 500." The
// dashboard reads this under the player's own RLS session
// (ranking_snapshots_select_own, step 3.1 migration); the CSV/feed import
// that writes these rows always runs on the service role instead.
export async function getLatestRankingSnapshotForPlayer(
  client: SupabaseClient<Database>,
  playerId: string,
): Promise<RankingSnapshot | null> {
  const { data, error } = await client
    .from('ranking_snapshots')
    .select('*')
    .eq('player_id', playerId)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// The dashboard hero's 52-week trajectory: the player's own snapshots,
// oldest first, under the same select-own policy as the latest-row read.
export async function listRankingSnapshotsForPlayer(
  client: SupabaseClient<Database>,
  playerId: string,
  sinceWeekStart: string,
): Promise<RankingSnapshot[]> {
  const { data, error } = await client
    .from('ranking_snapshots')
    .select('*')
    .eq('player_id', playerId)
    .gte('week_start', sinceWeekStart)
    .order('week_start', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// TECH-ARCHITECTURE.md section 2.2's shape for ranking_snapshots.points_by_tournament
// (the same one apps/api's Tournament Agent reads for defend points).
export interface PointsByTournamentEntry {
  tournamentId: string;
  event: 'singles' | 'doubles';
  points: number;
  expiryWeek: string;
}

/** Singles points expiring from `fromDate` up to `weeks` weeks ahead, soonest first. */
export function pointsToDefend(
  snapshot: Pick<RankingSnapshot, 'points_by_tournament'> | null,
  fromDate: string,
  weeks: number,
): PointsByTournamentEntry[] {
  if (!snapshot || !Array.isArray(snapshot.points_by_tournament)) return [];
  const from = Date.parse(fromDate);
  const until = from + weeks * 7 * 24 * 60 * 60 * 1000;
  return (snapshot.points_by_tournament as unknown as PointsByTournamentEntry[])
    .filter((e) => e && e.event === 'singles' && e.points > 0)
    .filter((e) => {
      const at = Date.parse(e.expiryWeek);
      return at >= from && at <= until;
    })
    .sort((a, b) => a.expiryWeek.localeCompare(b.expiryWeek));
}

// M-STG-4: "shown as a chip beside singles when inside 500."
export function showDoublesChip(doublesRank: number | null): boolean {
  return doublesRank !== null && doublesRank <= 500;
}

// M-STG-2: "The player can pin a stage manually in Profile; a pinned stage
// is not changed by detection and shows a 'pinned' indicator." A plain
// RLS-scoped write, same idiom as settings.ts's updatePreferences — the
// CSV/feed import (apps/api's service role) is the only other writer of
// these two columns, and it already checks stage_pinned before touching
// stage (apps/api/src/rankings/import-service.ts).
export async function setStagePinned(
  client: SupabaseClient<Database>,
  playerId: string,
  input: { pinned: boolean; stage: '1' | '2' | '3' },
): Promise<void> {
  const { error } = await client
    .from('players')
    .update({ stage_pinned: input.pinned, stage: input.stage })
    .eq('id', playerId);
  if (error) throw error;
}
