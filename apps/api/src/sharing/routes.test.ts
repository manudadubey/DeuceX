import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerSharingRoutes } from './routes';
import type { ActiveShareLink, CoachViewData, ManagerViewData, SharingDb } from './service';

const COACH_STUB: CoachViewData = {
  scope: 'coach',
  playerName: 'Arya Dubey',
  matches: [],
  patterns: [],
  shortlistAvailable: false,
  conditionsAvailable: false,
};

const MANAGER_STUB: ManagerViewData = {
  scope: 'manager',
  playerName: 'Arya Dubey',
  homeCurrency: 'AUD',
  reserves: 9450,
  grossWeeklySpend: 0,
  netBurn: 0,
  runwayWeeks: null,
  runwayColour: 'green',
  monthlyPnl: { income: 0, spend: 0, net: 0 },
  expenses: [],
  patronsAvailable: false,
};

function fakeSharingDb(link: ActiveShareLink | null): SharingDb {
  return {
    async findActiveLink() {
      return link;
    },
    async recordOpen() {},
    async getCoachData() {
      return COACH_STUB;
    },
    async getManagerData() {
      return MANAGER_STUB;
    },
  };
}

async function buildApp(db: SharingDb) {
  const app = Fastify();
  await registerSharingRoutes(app, { db });
  await app.ready();
  return app;
}

describe('GET /sharing/:token', () => {
  it('requires no authorization header at all', async () => {
    const app = await buildApp(
      fakeSharingDb({ id: 'link-1', playerId: 'player-1', scope: 'coach' }),
    );

    const res = await app.inject({ method: 'GET', url: '/sharing/tok-1' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(COACH_STUB);
  });

  it('returns the manager DTO with a real null runwayWeeks over the wire (not Infinity, which JSON cannot carry)', async () => {
    const app = await buildApp(
      fakeSharingDb({ id: 'link-2', playerId: 'player-1', scope: 'manager' }),
    );

    const res = await app.inject({ method: 'GET', url: '/sharing/tok-2' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(MANAGER_STUB);
    expect(res.json().runwayWeeks).toBeNull();
  });

  it('returns a generic 404 for an unknown, revoked or expired token', async () => {
    const app = await buildApp(fakeSharingDb(null));

    const res = await app.inject({ method: 'GET', url: '/sharing/no-such-token' });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('This link is invalid or has expired');
  });
});
