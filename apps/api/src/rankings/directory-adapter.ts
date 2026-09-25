import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type {
  RankingCandidate,
  RankingLookupAdapter,
  RankingLookupInput,
  RankingLookupResult,
} from './adapter';

type SnapshotRow = Database['public']['Tables']['ranking_snapshots']['Row'];

async function latestWeekStart(db: SupabaseClient<Database>): Promise<string | null> {
  const { data, error } = await db
    .from('ranking_snapshots')
    .select('week_start')
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.week_start ?? null;
}

function toCandidate(row: SnapshotRow): RankingCandidate {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    tourRank: row.tour_singles_rank,
    itfRank: row.itf_rank,
  };
}

// wtn is always null: no WTN feed exists yet (only the ATP/WTA/ITF ranking
// CSV this step builds), same honest gap as the rest of TECH-ARCHITECTURE.md
// section 4's risk statement about which feeds are actually signed.
function toVerified(row: SnapshotRow): RankingLookupResult | null {
  if (row.tour_singles_rank === null) return null;
  return {
    status: 'verified',
    source: row.source === 'csv_import' ? 'DeuceX ranking import' : 'feed',
    tourRank: row.tour_singles_rank,
    tourPoints: row.tour_singles_points ?? 0,
    itfRank: row.itf_rank,
    wtn: null,
  };
}

// The real production adapter for step 3.1: matches a new sign-up against
// the ranking_snapshots directory (TECH-ARCHITECTURE.md 2.2's own shape,
// player_id nullable — see the migration's design note) instead of always
// returning "unverified" (step 1.4's createUnverifiedRankingAdapter, which
// stays registered as the fixture-proof fallback when no snapshot exists
// yet for a brand-new deployment). Read-only: it never writes a player_id
// back onto a directory row itself. A newly onboarded player's own
// tour_rank/stage (written by finishOnboarding from this same lookup
// result) is what's correct until the next CSV import links their history —
// see the migration comment for why that's an acceptable, documented gap
// rather than a synchronous write here.
export function createDirectoryRankingAdapter(db: SupabaseClient<Database>): RankingLookupAdapter {
  return {
    async lookup(input: RankingLookupInput): Promise<RankingLookupResult> {
      const week = await latestWeekStart(db);
      if (!week) return { status: 'unverified' };

      if (input.tourPlayerId) {
        const { data, error } = await db
          .from('ranking_snapshots')
          .select('*')
          .eq('tour', input.tour)
          .eq('tour_player_id', input.tourPlayerId)
          .eq('week_start', week)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const verified = toVerified(data);
          if (verified) return verified;
        }
      }

      if (input.itfId) {
        const { data, error } = await db
          .from('ranking_snapshots')
          .select('*')
          .eq('tour', input.tour)
          .eq('itf_id', input.itfId)
          .eq('week_start', week)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const verified = toVerified(data);
          if (verified) return verified;
        }
      }

      // Decisions worksheet 2 / PRD-11: a name+country fuzzy match, for
      // "common surnames, a lagging ITF feed" — the exact case the
      // ambiguous-match chooser exists for.
      const { data: nameMatches, error: nameError } = await db
        .from('ranking_snapshots')
        .select('*')
        .eq('tour', input.tour)
        .eq('week_start', week)
        .ilike('name', input.name.trim());
      if (nameError) throw nameError;

      const rows = nameMatches ?? [];
      if (rows.length === 0) return { status: 'unverified' };
      if (rows.length === 1) {
        const onlyMatch = rows[0]!;
        if (onlyMatch.country.toLowerCase() === input.country.trim().toLowerCase()) {
          const verified = toVerified(onlyMatch);
          if (verified) return verified;
        }
      }
      return { status: 'ambiguous', candidates: rows.map(toCandidate) };
    },
  };
}
