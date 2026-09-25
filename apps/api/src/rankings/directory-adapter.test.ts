import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { describe, expect, it } from 'vitest';
import { FakeDb } from '../test-support/fake-db';
import { createDirectoryRankingAdapter } from './directory-adapter';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: `snap-${Math.random().toString(36).slice(2)}`,
    player_id: null,
    tour: 'atp',
    tour_player_id: null,
    itf_id: null,
    name: 'Arya Dubey',
    country: 'Austria',
    week_start: '2026-09-21',
    tour_singles_rank: 487,
    tour_singles_points: 96,
    tour_doubles_rank: null,
    tour_doubles_points: null,
    itf_rank: 212,
    itf_points: null,
    source: 'csv_import',
    ...overrides,
  };
}

describe('createDirectoryRankingAdapter', () => {
  it('returns unverified when no snapshot has ever been imported', async () => {
    const fake = new FakeDb();
    const adapter = createDirectoryRankingAdapter(asDb(fake));
    const result = await adapter.lookup({
      tour: 'atp',
      tourPlayerId: 'B0AH',
      itfId: null,
      name: 'Arya Dubey',
      country: 'Austria',
    });
    expect(result).toEqual({ status: 'unverified' });
  });

  it('returns verified on an exact tour_player_id match at the latest week', async () => {
    const fake = new FakeDb();
    fake.tables.ranking_snapshots = [snapshot({ tour_player_id: 'B0AH' })];
    const adapter = createDirectoryRankingAdapter(asDb(fake));

    const result = await adapter.lookup({
      tour: 'atp',
      tourPlayerId: 'B0AH',
      itfId: null,
      name: 'Arya Dubey',
      country: 'Austria',
    });

    expect(result).toEqual({
      status: 'verified',
      source: 'DeuceX ranking import',
      tourRank: 487,
      tourPoints: 96,
      itfRank: 212,
      wtn: null,
    });
  });

  it('returns ambiguous when the same name matches multiple candidates (decisions worksheet 2)', async () => {
    const fake = new FakeDb();
    fake.tables.ranking_snapshots = [
      snapshot({ tour_player_id: 'AUT1', country: 'Austria', tour_singles_rank: 487 }),
      snapshot({ tour_player_id: 'IND1', country: 'India', tour_singles_rank: 900 }),
    ];
    const adapter = createDirectoryRankingAdapter(asDb(fake));

    const result = await adapter.lookup({
      tour: 'atp',
      tourPlayerId: null,
      itfId: null,
      name: 'Arya Dubey',
      country: 'Germany', // matches neither candidate's country
    });

    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.candidates).toHaveLength(2);
    }
  });

  it('returns unverified when the name matches nobody in the directory', async () => {
    const fake = new FakeDb();
    fake.tables.ranking_snapshots = [snapshot({ tour_player_id: 'B0AH' })];
    const adapter = createDirectoryRankingAdapter(asDb(fake));

    const result = await adapter.lookup({
      tour: 'atp',
      tourPlayerId: 'DIFFERENT_ID',
      itfId: null,
      name: 'Someone Else',
      country: 'Australia',
    });

    expect(result).toEqual({ status: 'unverified' });
  });
});
