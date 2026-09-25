import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { describe, expect, it } from 'vitest';
import { FakeDb } from '../test-support/fake-db';
import {
  applyRankingImport,
  DuplicateRankingImportError,
  planRankingImport,
} from './import-service';
import type { RankingFeedRow } from './csv';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

function feedRow(overrides: Partial<RankingFeedRow> = {}): RankingFeedRow {
  return {
    tour: 'atp',
    tourPlayerId: 'B0AH',
    itfId: null,
    name: 'Arya Dubey',
    country: 'Austria',
    weekStart: '2026-09-21',
    tourSinglesRank: 487,
    tourSinglesPoints: 96,
    tourDoublesRank: null,
    tourDoublesPoints: null,
    itfRank: 212,
    itfPoints: null,
    ...overrides,
  };
}

describe('planRankingImport (pure)', () => {
  it('matches a row to an existing player and detects a stage change', () => {
    const plan = planRankingImport(
      [feedRow({ tourSinglesRank: 790 })], // crosses from 810 to 790: stage 1 -> 2
      [
        {
          id: 'p1',
          tour: 'atp',
          tourPlayerId: 'B0AH',
          itfId: null,
          tourRank: 810,
          stage: '1',
          stagePinned: false,
          name: 'Arya Dubey',
        },
      ],
    );
    expect(plan.matched).toHaveLength(1);
    expect(plan.matched[0]).toMatchObject({
      playerId: 'p1',
      beforeStage: '1',
      afterStage: '2',
      stageChanged: true,
    });
    expect(plan.stageChangeCount).toBe(1);
    expect(plan.unmatched).toHaveLength(0);
  });

  it("never changes a pinned player's stage (M-STG-2), even when the detected stage differs", () => {
    const plan = planRankingImport(
      [feedRow({ tourSinglesRank: 10 })], // would detect stage 3
      [
        {
          id: 'p1',
          tour: 'atp',
          tourPlayerId: 'B0AH',
          itfId: null,
          tourRank: 810,
          stage: '1',
          stagePinned: true,
          name: 'Arya Dubey',
        },
      ],
    );
    expect(plan.matched[0]?.afterStage).toBe('1');
    expect(plan.matched[0]?.stageChanged).toBe(false);
    expect(plan.stageChangeCount).toBe(0);
  });

  it('reports a row with no matching player as unmatched (AD-18)', () => {
    const plan = planRankingImport([feedRow({ tourPlayerId: 'UNKNOWN' })], []);
    expect(plan.matched).toHaveLength(0);
    expect(plan.unmatched).toEqual([
      {
        tour: 'atp',
        tourPlayerId: 'UNKNOWN',
        itfId: null,
        name: 'Arya Dubey',
        country: 'Austria',
      },
    ]);
  });

  it('matches by itf_id when tour_player_id is absent', () => {
    const plan = planRankingImport(
      [feedRow({ tourPlayerId: null, itfId: 'W212' })],
      [
        {
          id: 'p1',
          tour: 'atp',
          tourPlayerId: null,
          itfId: 'W212',
          tourRank: null,
          stage: '1',
          stagePinned: false,
          name: 'Arya Dubey',
        },
      ],
    );
    expect(plan.matched[0]?.playerId).toBe('p1');
  });
});

describe('applyRankingImport', () => {
  it('updates 342 fixture players and reports their stage changes (build plan step 3.1 acceptance)', async () => {
    const fake = new FakeDb();
    const players = Array.from({ length: 342 }, (_, i) => ({
      id: `player-${i}`,
      tour: i % 2 === 0 ? 'atp' : 'wta',
      tour_player_id: `FX${String(i).padStart(4, '0')}`,
      itf_id: null,
      tour_rank: 900, // stage 1 (above 800) before import
      stage: '1',
      stage_pinned: false,
      name: `Fixture Player ${i}`,
    }));
    fake.tables.players = players;
    fake.tables.feed_status = [
      { feed: 'atp_rankings', next_expected_at: new Date().toISOString() },
      { feed: 'wta_rankings', next_expected_at: new Date().toISOString() },
    ];

    const rows: RankingFeedRow[] = players.map((p, i) =>
      feedRow({
        tour: p.tour as 'atp' | 'wta',
        tourPlayerId: p.tour_player_id,
        itfId: null,
        name: p.name,
        // Every third player crosses into stage 2 (rank 790); the rest stay
        // deep in stage 1, so the stage-change count is exactly verifiable.
        tourSinglesRank: i % 3 === 0 ? 790 : 950,
      }),
    );

    const db = asDb(fake);
    const result = await applyRankingImport(db, rows, 'file-hash-342', 'ops');

    expect(result.matchedCount).toBe(342);
    expect(result.unmatchedCount).toBe(0);
    const expectedStageChanges = players.filter((_, i) => i % 3 === 0).length;
    expect(result.stageChangeCount).toBe(expectedStageChanges);

    // Every matched player's stage was actually written.
    const changedCount = fake.tables.players.filter((p) => p.stage === '2').length;
    expect(changedCount).toBe(expectedStageChanges);
  });

  it('refuses to re-apply the exact same file twice', async () => {
    const fake = new FakeDb();
    fake.tables.players = [
      {
        id: 'p1',
        tour: 'atp',
        tour_player_id: 'B0AH',
        itf_id: null,
        tour_rank: 810,
        stage: '1',
        stage_pinned: false,
        name: 'Arya Dubey',
      },
    ];
    fake.tables.feed_status = [
      { feed: 'atp_rankings', next_expected_at: new Date().toISOString() },
    ];
    const db = asDb(fake);
    const rows = [feedRow()];

    await applyRankingImport(db, rows, 'same-hash', 'ops');
    await expect(applyRankingImport(db, rows, 'same-hash', 'ops')).rejects.toThrow(
      DuplicateRankingImportError,
    );
  });

  it('writes an unmatched row as a directory-only snapshot (player_id null)', async () => {
    const fake = new FakeDb();
    fake.tables.players = [];
    fake.tables.feed_status = [
      { feed: 'atp_rankings', next_expected_at: new Date().toISOString() },
    ];
    const db = asDb(fake);

    await applyRankingImport(db, [feedRow()], 'hash-unmatched', 'ops');

    expect(fake.tables.ranking_snapshots).toHaveLength(1);
    expect(fake.tables.ranking_snapshots?.[0]?.player_id).toBeNull();
  });
});
