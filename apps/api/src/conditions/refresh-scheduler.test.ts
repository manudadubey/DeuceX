import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { AgentRunsDb } from '@deucex/actions';
import type { PgBoss } from 'pg-boss';
import { createMockProseClient } from '@deucex/agents';
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

    const brief = (fake.tables.conditions_briefs ?? []).find((b) => b.tournament_id === 'lisboa');
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
    const brief = (fake.tables.conditions_briefs ?? []).find((b) => b.tournament_id === 'lisboa');
    expect(brief!.diff).toBe('kept diff');
  });
});

// Google's terms allow a daily forecast to be kept for 24 hours, so a
// google-sourced brief the Entered-event refresh doesn't cover (a shortlist
// candidate, or an event outside its travel window) is fetched again after
// GOOGLE_RETENTION_REFRESH_HOURS, silently.
describe('registerConditionsRefreshScheduler · 24-hour Google retention', () => {
  const NOW = new Date('2026-09-21T12:00:00Z');
  const SINTRA = { ...LISBOA, id: 'sintra', name: 'Sintra', start_date: '2026-09-24' };
  const PAST = {
    ...LISBOA,
    id: 'past',
    name: 'Past',
    start_date: '2026-09-07',
    end_date: '2026-09-13',
  };

  function brief(tournamentId: string, hoursOld: number, source = 'google') {
    return {
      id: `brief-${tournamentId}`,
      player_id: 'player-1',
      tournament_id: tournamentId,
      tension: false,
      ball_diff: true,
      frames: 3,
      temp_max: 22,
      rh_max: 60,
      diff: 'kept diff',
      practice: 'kept practice',
      forecast_source: source,
      forecast_at: new Date(NOW.getTime() - hoursOld * 3_600_000).toISOString(),
    };
  }

  async function runOnce(
    fake: FakeDb,
    forecast: Parameters<typeof createFixtureWeatherAdapter>[0],
  ) {
    let workFn: (() => Promise<void>) | null = null;
    const fakeBoss = {
      work: async (_queue: string, fn: () => Promise<void>) => {
        workFn = fn;
      },
    } as unknown as PgBoss;
    await registerConditionsRefreshScheduler(fakeBoss, {
      db: asDb(fake),
      agentRuns: fakeAgentRunsDb(),
      weatherAdapter: { ...createFixtureWeatherAdapter(forecast), source: 'google' },
      proseClient: createMockProseClient(),
      now: () => NOW,
    });
    await workFn!();
  }

  it('refetches a 21-hour-old shortlist brief, leaves a 10-hour-old one, and never notifies', async () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [LISBOA, SINTRA];
    fake.tables.entry_decisions = [];
    fake.tables.conditions_briefs = [brief('lisboa', 21), brief('sintra', 10)];

    await runOnce(fake, {
      tempMaxC: 31,
      tempMinC: 24,
      rhMinPct: 60,
      rhMaxPct: 75,
      windMinKmh: 15,
      windMaxKmh: 25,
    });

    const rows = fake.tables.conditions_briefs ?? [];
    const lisboa = rows.find((b) => b.tournament_id === 'lisboa')!;
    const sintra = rows.find((b) => b.tournament_id === 'sintra')!;
    expect(lisboa.forecast_at).toBe(NOW.toISOString());
    expect(lisboa.temp_max).toBe(31);
    expect(sintra.temp_max).toBe(22);
    expect(fake.tables.notifications ?? []).toHaveLength(0);
  });

  it('drops a finished event to climate normals, which ends its refreshes', async () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [PAST];
    fake.tables.entry_decisions = [];
    fake.tables.conditions_briefs = [brief('past', 23)];

    await runOnce(fake, null);

    const row = (fake.tables.conditions_briefs ?? []).find((b) => b.tournament_id === 'past')!;
    expect(row.forecast_source).toBe('climate-normals');
    expect(row.refreshed).toBe(false);
  });

  it('ignores briefs from other sources', async () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [LISBOA];
    fake.tables.entry_decisions = [];
    fake.tables.conditions_briefs = [brief('lisboa', 30, 'open-meteo')];

    await runOnce(fake, null);

    const row = (fake.tables.conditions_briefs ?? []).find((b) => b.tournament_id === 'lisboa')!;
    expect(row.forecast_source).toBe('open-meteo');
    expect(row.temp_max).toBe(22);
  });
});
