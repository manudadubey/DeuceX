import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import Fastify from 'fastify';
import { createFixtureRankingAdapter } from './fixture-adapter';
import { createUnverifiedRankingAdapter } from './unverified-adapter';
import { registerRankingsRoutes, type RankingsRoutesDeps } from './routes';

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

async function buildApp(overrides: Partial<RankingsRoutesDeps> = {}) {
  const app = Fastify();
  const deps: RankingsRoutesDeps = {
    anonClient: fakeAnonClient('good-token', 'player-1'),
    ranking: createUnverifiedRankingAdapter(),
    ...overrides,
  };
  await registerRankingsRoutes(app, deps);
  await app.ready();
  return app;
}

const VALID_BODY = {
  tour: 'atp',
  tourPlayerId: 'B0AH',
  itfId: null,
  name: 'Arya Dubey',
  country: 'Austria',
};

describe('POST /rankings/lookup', () => {
  it('rejects a request with no bearer token', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/rankings/lookup', payload: VALID_BODY });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a body missing both id fields', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/rankings/lookup',
      headers: { authorization: 'Bearer good-token' },
      payload: { ...VALID_BODY, tourPlayerId: null, itfId: null },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns unverified from the production stub adapter', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/rankings/lookup',
      headers: { authorization: 'Bearer good-token' },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: { status: 'unverified' } });
  });

  it('passes through a verified result from a fixture adapter (proving the shape for step 3.1)', async () => {
    const verified = {
      status: 'verified' as const,
      source: 'TDI live feed',
      tourRank: 487,
      tourPoints: 96,
      itfRank: 212,
      wtn: 8.4,
    };
    const app = await buildApp({ ranking: createFixtureRankingAdapter(verified) });
    const res = await app.inject({
      method: 'POST',
      url: '/rankings/lookup',
      headers: { authorization: 'Bearer good-token' },
      payload: VALID_BODY,
    });
    expect(res.json()).toEqual({ result: verified });
  });

  it('passes through an ambiguous result with candidates (the chooser, decisions worksheet 2)', async () => {
    const ambiguous = {
      status: 'ambiguous' as const,
      candidates: [
        { id: 'c1', name: 'Arya Dubey', country: 'AUT', tourRank: 487, itfRank: null },
        { id: 'c2', name: 'Arya Dubey', country: 'IND', tourRank: null, itfRank: 340 },
      ],
    };
    const app = await buildApp({ ranking: createFixtureRankingAdapter(ambiguous) });
    const res = await app.inject({
      method: 'POST',
      url: '/rankings/lookup',
      headers: { authorization: 'Bearer good-token' },
      payload: VALID_BODY,
    });
    expect(res.json()).toEqual({ result: ambiguous });
  });
});
