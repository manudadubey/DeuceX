import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@procircuit/db';
import { detectStage } from '@procircuit/db';
import type { RankingFeedRow } from './csv';

type PlayerStage = '1' | '2' | '3';

interface ExistingPlayer {
  id: string;
  tour: 'atp' | 'wta';
  tourPlayerId: string | null;
  itfId: string | null;
  tourRank: number | null;
  stage: PlayerStage | null;
  stagePinned: boolean;
  name: string;
}

export interface MatchedPlayerChange {
  playerId: string;
  name: string;
  tour: 'atp' | 'wta';
  beforeTourSinglesRank: number | null;
  afterTourSinglesRank: number | null;
  beforeStage: PlayerStage | null;
  afterStage: PlayerStage;
  stageChanged: boolean;
}

export interface UnmatchedRow {
  tour: 'atp' | 'wta';
  tourPlayerId: string | null;
  itfId: string | null;
  name: string;
  country: string;
}

export interface RankingImportPlan {
  /** Parallel to the input rows array: the player each row resolved to, or null (AD-18's "unmatched"). */
  playerIdByRow: (string | null)[];
  matched: MatchedPlayerChange[];
  unmatched: UnmatchedRow[];
  stageChangeCount: number;
}

function matchKey(tour: string, id: string): string {
  return `${tour}:${id}`;
}

// Pure: given the CSV rows and the players a real import would match
// against, decides what changes (M-STG-1's "stage detection on every
// refresh," respecting M-STG-2's pin) without touching the database. Used
// by both the admin preview (AD-18, no write) and applyRankingImport (which
// runs this then writes exactly what it decided).
export function planRankingImport(
  rows: readonly RankingFeedRow[],
  existingPlayers: readonly ExistingPlayer[],
): RankingImportPlan {
  const byTourPlayerId = new Map<string, ExistingPlayer>();
  const byItfId = new Map<string, ExistingPlayer>();
  for (const p of existingPlayers) {
    if (p.tourPlayerId) byTourPlayerId.set(matchKey(p.tour, p.tourPlayerId), p);
    if (p.itfId) byItfId.set(matchKey(p.tour, p.itfId), p);
  }

  const playerIdByRow: (string | null)[] = [];
  const matched: MatchedPlayerChange[] = [];
  const unmatched: UnmatchedRow[] = [];

  for (const row of rows) {
    const player =
      (row.tourPlayerId && byTourPlayerId.get(matchKey(row.tour, row.tourPlayerId))) ||
      (row.itfId && byItfId.get(matchKey(row.tour, row.itfId))) ||
      null;

    if (!player) {
      playerIdByRow.push(null);
      unmatched.push({
        tour: row.tour,
        tourPlayerId: row.tourPlayerId,
        itfId: row.itfId,
        name: row.name,
        country: row.country,
      });
      continue;
    }

    playerIdByRow.push(player.id);
    const detected = detectStage(row.tourSinglesRank);
    const afterStage = player.stagePinned ? (player.stage ?? detected) : detected;
    matched.push({
      playerId: player.id,
      name: player.name,
      tour: row.tour,
      beforeTourSinglesRank: player.tourRank,
      afterTourSinglesRank: row.tourSinglesRank,
      beforeStage: player.stage,
      afterStage,
      stageChanged: !player.stagePinned && player.stage !== afterStage,
    });
  }

  return {
    playerIdByRow,
    matched,
    unmatched,
    stageChangeCount: matched.filter((m) => m.stageChanged).length,
  };
}

export interface RankingImportResult {
  importId: string;
  rowsProcessed: number;
  matchedCount: number;
  unmatchedCount: number;
  stageChangeCount: number;
}

async function loadExistingPlayers(db: SupabaseClient<Database>): Promise<ExistingPlayer[]> {
  const { data, error } = await db
    .from('players')
    .select('id, tour, tour_player_id, itf_id, tour_rank, stage, stage_pinned, name')
    .or('tour_player_id.not.is.null,itf_id.not.is.null');
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    tour: p.tour as 'atp' | 'wta',
    tourPlayerId: p.tour_player_id,
    itfId: p.itf_id,
    tourRank: p.tour_rank,
    stage: p.stage as PlayerStage | null,
    stagePinned: p.stage_pinned,
    name: p.name,
  }));
}

function feedKeysForRow(row: RankingFeedRow): string[] {
  const keys = [`${row.tour}_rankings`];
  if (row.itfRank !== null)
    keys.push(row.tour === 'atp' ? 'itf_men_rankings' : 'itf_women_rankings');
  return keys;
}

// AD-18: "Ops can import a ranking snapshot by CSV... and apply it"; applied
// snapshots "follow the same path as feed refreshes (stage re-detection,
// chart refresh, no player notification before the next morning run)."
// Runs entirely on the service role (apps/api's db client), same as every
// other cross-player write in this codebase (markReceivableReceived,
// the sharing token read).
export class DuplicateRankingImportError extends Error {
  constructor(fileHash: string) {
    super(`This exact file was already imported (file_hash=${fileHash})`);
    this.name = 'DuplicateRankingImportError';
  }
}

export async function applyRankingImport(
  db: SupabaseClient<Database>,
  rows: readonly RankingFeedRow[],
  fileHash: string,
  appliedBy: string | null,
): Promise<RankingImportResult> {
  // Idempotency at the file level, not the row level: ranking_snapshots'
  // uniqueness is two partial indexes (a person may carry only one of
  // tour_player_id/itf_id), and Postgres can't target a partial unique
  // index from a plain ON CONFLICT (columns) clause without also repeating
  // its WHERE predicate there, which supabase-js's upsert() has no way to
  // express. A file-hash check plus plain inserts sidesteps that instead of
  // fighting it; re-submitting the identical export is a no-op, and a
  // genuine same-week re-import under a different file is left to fail on
  // the partial unique index, which is the right outcome (ops needs to
  // notice, not silently overwrite).
  const { data: already, error: dupCheckError } = await db
    .from('snapshot_imports')
    .select('id')
    .eq('file_hash', fileHash)
    .maybeSingle();
  if (dupCheckError) throw dupCheckError;
  if (already) throw new DuplicateRankingImportError(fileHash);

  const existingPlayers = await loadExistingPlayers(db);
  const plan = planRankingImport(rows, existingPlayers);

  const snapshotRows = rows.map((row, i) => ({
    player_id: plan.playerIdByRow[i] ?? null,
    tour: row.tour,
    tour_player_id: row.tourPlayerId,
    itf_id: row.itfId,
    name: row.name,
    country: row.country,
    week_start: row.weekStart,
    tour_singles_rank: row.tourSinglesRank,
    tour_singles_points: row.tourSinglesPoints,
    tour_doubles_rank: row.tourDoublesRank,
    tour_doubles_points: row.tourDoublesPoints,
    itf_rank: row.itfRank,
    itf_points: row.itfPoints,
    source: 'csv_import' as const,
  }));

  if (snapshotRows.length > 0) {
    const { error } = await db.from('ranking_snapshots').insert(snapshotRows);
    if (error) throw error;
  }

  for (const match of plan.matched) {
    const { error } = await db
      .from('players')
      .update({ tour_rank: match.afterTourSinglesRank, stage: match.afterStage })
      .eq('id', match.playerId);
    if (error) throw error;
  }

  const feedCounts = new Map<string, number>();
  for (const row of rows) {
    for (const key of feedKeysForRow(row)) {
      feedCounts.set(key, (feedCounts.get(key) ?? 0) + 1);
    }
  }
  const now = new Date();
  const nextExpected = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  for (const [feed, rowCount] of feedCounts) {
    const { error } = await db
      .from('feed_status')
      .update({
        last_run_at: now.toISOString(),
        last_result: 'ok',
        row_count: rowCount,
        next_expected_at: nextExpected.toISOString(),
        issues: [],
        updated_at: now.toISOString(),
      })
      .eq('feed', feed);
    if (error) throw error;
  }

  const { data: importRow, error: importError } = await db
    .from('snapshot_imports')
    .insert({
      file_hash: fileHash,
      rows: rows.length,
      matched: plan.matched.length,
      unmatched: plan.unmatched as unknown as Json,
      stage_changes: plan.stageChangeCount,
      applied_by: appliedBy,
    })
    .select('id')
    .single();
  if (importError) throw importError;

  return {
    importId: importRow.id,
    rowsProcessed: rows.length,
    matchedCount: plan.matched.length,
    unmatchedCount: plan.unmatched.length,
    stageChangeCount: plan.stageChangeCount,
  };
}

export async function previewRankingImport(
  db: SupabaseClient<Database>,
  rows: readonly RankingFeedRow[],
): Promise<RankingImportPlan> {
  const existingPlayers = await loadExistingPlayers(db);
  return planRankingImport(rows, existingPlayers);
}
