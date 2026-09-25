import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { AgentRunsDb } from '@deucex/actions';
import { createMockProseClient } from '@deucex/agents';
import Fastify from 'fastify';
import { FakeDb } from '../test-support/fake-db';
import { createFixtureWeatherAdapter } from './fixture-adapter';
import { registerConditionsRoutes, type ConditionsRoutesDeps } from './routes';

function fakeAgentRunsDb(): AgentRunsDb {
  return { insertAgentRun: async () => undefined };
}

function fakeAnonClient(validToken: string, playerId: string): SupabaseClient<Database> {
  return {
    auth: {
      async getUser(token?: string) {
        if (token === validToken) {
          return { data: { user: { id: playerId } }, error: null };
        }
        return { data: { user: null }, error: new Error('invalid token') };
      },
    },
  } as unknown as SupabaseClient<Database>;
}

async function buildApp(fake: FakeDb, overrides: Partial<ConditionsRoutesDeps> = {}) {
  const app = Fastify();
  const deps: ConditionsRoutesDeps = {
    db: fake as unknown as SupabaseClient<Database>,
    anonClient: fakeAnonClient('good-token', 'player-1'),
    agentRuns: fakeAgentRunsDb(),
    weatherAdapter: createFixtureWeatherAdapter(),
    proseClient: createMockProseClient(),
    ...overrides,
  };
  await registerConditionsRoutes(app, deps);
  await app.ready();
  return app;
}

describe('POST /conditions/re-run', () => {
  it('refuses a request with no bearer token', async () => {
    const app = await buildApp(new FakeDb({ players: [{ id: 'player-1' }] }));
    const res = await app.inject({ method: 'POST', url: '/conditions/re-run' });
    expect(res.statusCode).toBe(401);
  });

  it('returns refreshed:0 when there is no current shortlist', async () => {
    const app = await buildApp(new FakeDb({ players: [{ id: 'player-1' }] }));
    const res = await app.inject({
      method: 'POST',
      url: '/conditions/re-run',
      headers: { authorization: 'Bearer good-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ refreshed: 0 });
  });

  // CE-15: "saving [the equipment profile] triggers a re-run of every
  // current brief" — this is the route apps/web's Equipment pane calls
  // after its own direct Supabase write, exercised here end to end against
  // a real shortlisted candidate.
  it('re-runs every current shortlisted candidate and persists a brief', async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1' }] });
    fake.tables.shortlist_candidates = [
      { player_id: 'player-1', tournament_id: 'poznan', current: true },
    ];
    fake.tables.tournaments = [
      {
        id: 'poznan',
        name: 'Poznań',
        surface: 'clay',
        indoor_outdoor: 'outdoor',
        city: 'Poznań',
        lat: 52.4,
        lon: 16.9,
        altitude_m: 80,
        ball: 'Dunlop Fort',
        start_date: '2026-09-28',
        end_date: '2026-10-04',
      },
    ];

    const app = await buildApp(fake);
    const res = await app.inject({
      method: 'POST',
      url: '/conditions/re-run',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ refreshed: 1 });
    const briefs = fake.tables.conditions_briefs ?? [];
    expect(briefs).toHaveLength(1);
    expect(briefs[0]!.tournament_id).toBe('poznan');
  });
});
