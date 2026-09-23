import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { AgentRunsDb } from '@procircuit/actions';
import type { PgBoss } from 'pg-boss';
import { createMockProseClient } from '@procircuit/agents';
import { FakeDb } from '../test-support/fake-db';
import { createFixtureWeatherAdapter } from './fixture-adapter';
import {
  listEnteredEventsInTravelWindow,
  registerConditionsRefreshScheduler,
} from './refresh-scheduler';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

function fakeAgentRunsDb(): AgentRunsDb {
  return { insertAgentRun: async () => undefined };
}

const LISBOA = {
  id: 'lisboa',
  name: 'Lisboa',
  surface: 'hard',
  indoor_outdoor: 'outdoor',
  city: 'Lisboa',
  lat: 38.7,
  lon: -9.1,
  altitude_m: 10,
  ball: 'Wilson US Open',
  start_date: '2026-09-25',
  end_date: '2026-10-01',
};

describe('listEnteredEventsInTravelWindow', () => {
  it('includes an Entered event within seven days of its first match day', () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [LISBOA];
    fake.tables.entry_decisions = [
      { player_id: 'player-1', tournament_id: 'lisboa', status: 'entered' },
    ];
    return listEnteredEventsInTravelWindow(asDb(fake), new Date('2026-09-21T00:00:00Z')).then(
      (events) => {
        expect(events).toHaveLength(1);
        expect(events[0]!.tournament.id).toBe('lisboa');
      },
    );
  });

  it('excludes an Entered event more than seven days out', async () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [LISBOA];
    fake.tables.entry_decisions = [
      { player_id: 'player-1', tournament_id: 'lisboa', status: 'entered' },
    ];
    const events = await listEnteredEventsInTravelWindow(
      asDb(fake),
      new Date('2026-09-01T00:00:00Z'),
    );
    expect(events).toHaveLength(0);
  });

  it('excludes a Skipped or Withdrawn tournament', async () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [LISBOA];
    fake.tables.entry_decisions = [
      { player_id: 'player-1', tournament_id: 'lisboa', status: 'skipped' },
    ];
    const events = await listEnteredEventsInTravelWindow(
      asDb(fake),
      new Date('2026-09-21T00:00:00Z'),
    );
    expect(events).toHaveLength(0);
  });
});

// CE-AC-14: "Lisbon is Entered and the day-before-travel refresh moves the
// forecast maximum from 27C to 30C... Air turns amber, tension flips to a
// test, and one FYI notification 'Lisbon brief refreshed' is sent."
describe('registerConditionsRefreshScheduler · CE-AC-14', () => {
  it('sends one FYI notification when a refresh flips the recommendation', async () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [LISBOA];
    fake.tables.entry_decisions = [
      { player_id: 'player-1', tournament_id: 'lisboa', status: 'entered' },
    ];
    // The stored brief from the pre-refresh 27C forecast: not amber, no test.
    fake.tables.conditions_briefs = [
      {
        id: 'brief-1',
        player_id: 'player-1',
        tournament_id: 'lisboa',
        tension: false,
        ball_diff: true,
        frames: 3,
        temp_max: 27,
        rh_max: 55,
        diff: 'old diff',
        practice: 'old practice',
      },
    ];

    let workFn: (() => Promise<void>) | null = null;
    const fakeBoss = {
      work: async (_queue: string, fn: () => Promise<void>) => {
        workFn = fn;
      },
    } as unknown as PgBoss;

    await registerConditionsRefreshScheduler(fakeBoss, {
      db: asDb(fake),
      agentRuns: fakeAgentRunsDb(),
      // The refreshed forecast: 30C max, well past the amber/tension
      // threshold — CE-AC-14's "moves the forecast maximum from 27C to 30C."
      weatherAdapter: createFixtureWeatherAdapter({
        tempMaxC: 30,
        tempMinC: 24,
        rhMinPct: 60,
        rhMaxPct: 75,
        windMinKmh: 15,
        windMaxKmh: 25,
      }),
      proseClient: createMockProseClient(),
      now: () => new Date('2026-09-21T00:00:00Z'),
    });

    await workFn!();

    const notifications = fake.tables.notifications ?? [];
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.title).toBe('Lisboa brief refreshed');

    const brief = fake.tables.conditions_briefs.find((b) => b.tournament_id === 'lisboa');
    expect(brief!.tension).toBe(true);
    expect(brief!.temp_max).toBe(30);
  });

  it('does not notify when nothing about the recommendation changed', async () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [LISBOA];
    fake.tables.entry_decisions = [
      { player_id: 'player-1', tournament_id: 'lisboa', status: 'entered' },
    ];
    fake.tables.conditions_briefs = [
      {
        id: 'brief-1',
        player_id: 'player-1',
        tournament_id: 'lisboa',
        tension: true,
        ball_diff: true,
        frames: 4,
        temp_max: 27,
        rh_max: 75,
        diff: 'kept diff',
        practice: 'kept practice',
      },
    ];

    let workFn: (() => Promise<void>) | null = null;
    const fakeBoss = {
      work: async (_queue: string, fn: () => Promise<void>) => {
        workFn = fn;
      },
    } as unknown as PgBoss;

    await registerConditionsRefreshScheduler(fakeBoss, {
      db: asDb(fake),
      agentRuns: fakeAgentRunsDb(),
      // Same recommendation as before (still humidity+wind driven tension,
      // still 4 frames, still not air-amber): only the exact numbers moved.
      weatherAdapter: createFixtureWeatherAdapter({
        tempMaxC: 26,
        tempMinC: 23,
        rhMinPct: 61,
        rhMaxPct: 74,
        windMinKmh: 16,
        windMaxKmh: 24,
      }),
      proseClient: createMockProseClient(),
      now: () => new Date('2026-09-21T00:00:00Z'),
    });

    await workFn!();

    expect(fake.tables.notifications ?? []).toHaveLength(0);
    const brief = fake.tables.conditions_briefs.find((b) => b.tournament_id === 'lisboa');
    expect(brief!.diff).toBe('kept diff');
  });
});
