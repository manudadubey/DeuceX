import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { AgentRunsDb } from '@deucex/actions';
import { createMockProseClient, type ProseModelClient } from '@deucex/agents';
import { FakeDb } from '../test-support/fake-db';
import { createFixtureWeatherAdapter } from './fixture-adapter';
import { runConditionsForCandidates } from './run';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

function fakeAgentRunsDb(): AgentRunsDb {
  return { insertAgentRun: async () => undefined };
}

function tournament(id: string, overrides: Record<string, unknown> = {}): TournamentRow {
  return {
    id,
    name: id,
    surface: 'clay',
    indoor_outdoor: 'outdoor',
    city: id,
    lat: 44.4,
    lon: 8.9,
    altitude_m: 20,
    ball: 'Dunlop Fort',
    start_date: '2026-09-08',
    end_date: '2026-09-14',
    ...overrides,
  } as unknown as TournamentRow;
}

describe('runConditionsForCandidates', () => {
  it('persists a tiles-complete brief per tournament', async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1' }] });
    await runConditionsForCandidates(
      {
        db: asDb(fake),
        agentRuns: fakeAgentRunsDb(),
        weatherAdapter: createFixtureWeatherAdapter(),
        proseClient: createMockProseClient(),
      },
      'player-1',
      [tournament('poznan')],
    );

    const briefs = fake.tables.conditions_briefs ?? [];
    expect(briefs).toHaveLength(1);
    expect(briefs[0]!.tournament_id).toBe('poznan');
    expect(briefs[0]!.io).toBe('Outdoor clay');
    expect(briefs[0]!.diff.length).toBeGreaterThan(0);
  });

  it('still persists the deterministic tiles when the prose call fails entirely', async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1' }] });
    const failingClient: ProseModelClient = {
      async complete() {
        throw new Error('vendor is down');
      },
    };

    await runConditionsForCandidates(
      {
        db: asDb(fake),
        agentRuns: fakeAgentRunsDb(),
        weatherAdapter: createFixtureWeatherAdapter(),
        proseClient: failingClient,
        logger: { error: () => undefined },
      },
      'player-1',
      [tournament('poznan')],
    );

    const briefs = fake.tables.conditions_briefs ?? [];
    expect(briefs).toHaveLength(1);
    expect(briefs[0]!.io).toBe('Outdoor clay');
    expect(briefs[0]!.diff).toBe('');
  });

  it('batches more than five candidates into more than one prose call', async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1' }] });
    let calls = 0;
    const countingClient: ProseModelClient = {
      async complete(prompt) {
        calls += 1;
        return createMockProseClient().complete(prompt);
      },
    };

    const tournaments = Array.from({ length: 7 }, (_, i) => tournament(`t${i}`));
    await runConditionsForCandidates(
      {
        db: asDb(fake),
        agentRuns: fakeAgentRunsDb(),
        weatherAdapter: createFixtureWeatherAdapter(),
        proseClient: countingClient,
      },
      'player-1',
      tournaments,
    );

    expect(calls).toBe(2); // 5 + 2
    expect(fake.tables.conditions_briefs ?? []).toHaveLength(7);
  });

  it("reuses a brief's sentences and skips the model when its prose input is unchanged (step 5.4)", async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1' }] });
    let calls = 0;
    const countingClient: ProseModelClient = {
      async complete(prompt) {
        calls += 1;
        return createMockProseClient().complete(prompt);
      },
    };
    const deps = {
      db: asDb(fake),
      agentRuns: fakeAgentRunsDb(),
      weatherAdapter: createFixtureWeatherAdapter(),
      proseClient: countingClient,
    };
    const now = new Date('2026-09-01T20:00:00Z');

    await runConditionsForCandidates(deps, 'player-1', [tournament('poznan')], now);
    const first = { ...fake.tables.conditions_briefs![0]! };
    await runConditionsForCandidates(deps, 'player-1', [tournament('poznan')], now);

    expect(calls).toBe(1);
    const [brief] = fake.tables.conditions_briefs!;
    expect(brief!.diff).toBe(first.diff);
    expect(brief!.prose_inputs_hash).toBe(first.prose_inputs_hash);
  });

  it("regenerates the sentences when the brief's rules change", async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1' }] });
    let calls = 0;
    const countingClient: ProseModelClient = {
      async complete(prompt) {
        calls += 1;
        return createMockProseClient().complete(prompt);
      },
    };
    const deps = {
      db: asDb(fake),
      agentRuns: fakeAgentRunsDb(),
      weatherAdapter: createFixtureWeatherAdapter(),
      proseClient: countingClient,
    };
    const now = new Date('2026-09-01T20:00:00Z');

    await runConditionsForCandidates(deps, 'player-1', [tournament('poznan')], now);
    await runConditionsForCandidates(
      deps,
      'player-1',
      [tournament('poznan', { altitude_m: 1800 })],
      now,
    );

    expect(calls).toBe(2);
  });

  it('does nothing for an empty candidate list', async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1' }] });
    await runConditionsForCandidates(
      {
        db: asDb(fake),
        agentRuns: fakeAgentRunsDb(),
        weatherAdapter: createFixtureWeatherAdapter(),
        proseClient: createMockProseClient(),
      },
      'player-1',
      [],
    );
    expect(fake.tables.conditions_briefs ?? []).toHaveLength(0);
  });
});
