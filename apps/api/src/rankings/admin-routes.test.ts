import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeDb } from '../test-support/fake-db';
import { registerAdminRankingsRoutes, type AdminRankingsRoutesDeps } from './admin-routes';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

async function buildApp(fake: FakeDb) {
  const app = Fastify();
  const deps: AdminRankingsRoutesDeps = { db: asDb(fake) };
  await registerAdminRankingsRoutes(app, deps);
  await app.ready();
  return app;
}

const HEADER =
  'tour,tour_player_id,itf_id,name,country,week_start,tour_singles_rank,tour_singles_points,tour_doubles_rank,tour_doubles_points,itf_rank,itf_points';

describe('GET /admin/rankings/feeds', () => {
  it('flags an overdue feed', async () => {
    const fake = new FakeDb();
    fake.tables.feed_status = [
      { feed: 'atp_rankings', next_expected_at: '2000-01-01T00:00:00Z' },
      { feed: 'wta_rankings', next_expected_at: '2999-01-01T00:00:00Z' },
    ];
    const app = await buildApp(fake);

    const res = await app.inject({ method: 'GET', url: '/admin/rankings/feeds' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.feeds.find((f: { feed: string }) => f.feed === 'atp_rankings').overdue).toBe(true);
    expect(body.feeds.find((f: { feed: string }) => f.feed === 'wta_rankings').overdue).toBe(false);
  });
});

describe('POST /admin/rankings/import/preview', () => {
  it('previews an unmatched row without writing anything', async () => {
    const fake = new FakeDb();
    const app = await buildApp(fake);
    const csv = `${HEADER}\natp,B0AH,,Arya Dubey,Austria,2026-09-21,487,96,,,212,`;

    const res = await app.inject({
      method: 'POST',
      url: '/admin/rankings/import/preview',
      payload: { csv },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().unmatchedCount).toBe(1);
    expect(fake.tables.ranking_snapshots ?? []).toHaveLength(0);
  });

  it('rejects an invalid CSV with a 400', async () => {
    const fake = new FakeDb();
    const app = await buildApp(fake);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/rankings/import/preview',
      payload: { csv: 'not,a,valid,header' },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /admin/rankings/import/apply', () => {
  it('applies a matching import and reports the result', async () => {
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
    const app = await buildApp(fake);
    const csv = `${HEADER}\natp,B0AH,,Arya Dubey,Austria,2026-09-21,790,120,,,212,`;

    const res = await app.inject({
      method: 'POST',
      url: '/admin/rankings/import/apply',
      payload: { csv, appliedBy: 'ops' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.matchedCount).toBe(1);
    expect(body.stageChangeCount).toBe(1);
  });
});

describe('tournaments deadline entry (AD-21)', () => {
  it('lists tournaments with no published deadline and lets ops set one', async () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [
      {
        id: 't1',
        tour: 'atp',
        name: 'ITF M25 Sibiu',
        start_date: '2026-10-01',
        end_date: '2026-10-07',
        city: 'Sibiu',
        country: 'Romania',
        entry_deadline: null,
      },
    ];
    const app = await buildApp(fake);

    const listRes = await app.inject({ method: 'GET', url: '/admin/tournaments/missing-deadline' });
    expect(listRes.json().tournaments).toHaveLength(1);

    const setRes = await app.inject({
      method: 'POST',
      url: '/admin/tournaments/t1/deadline',
      payload: { entryDeadline: '2026-09-25' },
    });
    expect(setRes.statusCode).toBe(200);
    expect(fake.tables.tournaments[0]?.entry_deadline).toBe('2026-09-25');
  });
});

describe('fact-sheet corrections (AD-20)', () => {
  it('proposes, then applies, a correction with a before/after diff', async () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [
      {
        id: 't1',
        tour: 'atp',
        name: 'ITF M25 Sibiu',
        start_date: '2026-10-01',
        end_date: '2026-10-07',
        ball: 'Wilson US Open',
      },
    ];
    const app = await buildApp(fake);

    const proposeRes = await app.inject({
      method: 'POST',
      url: '/admin/corrections',
      payload: {
        tournamentId: 't1',
        field: 'ball',
        after: 'Dunlop Fort',
        source: 'Organiser fact sheet',
      },
    });
    expect(proposeRes.statusCode).toBe(200);
    const correction = proposeRes.json().correction;
    expect(correction.before).toBe('Wilson US Open');
    expect(correction.state).toBe('proposed');

    const applyRes = await app.inject({
      method: 'POST',
      url: `/admin/corrections/${correction.id}/apply`,
    });
    expect(applyRes.statusCode).toBe(200);
    expect(fake.tables.tournaments[0]?.ball).toBe('Dunlop Fort');
    expect(fake.tables.fact_corrections?.find((c) => c.id === correction.id)?.state).toBe(
      'applied',
    );
  });

  it('rejects an unknown correctable field', async () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [{ id: 't1', ball: 'Wilson US Open' }];
    const app = await buildApp(fake);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/corrections',
      payload: { tournamentId: 't1', field: 'name', after: 'New Name', source: 'ops' },
    });
    expect(res.statusCode).toBe(400);
  });
});
