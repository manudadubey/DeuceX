import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { AgentRunInsert, AgentRunsDb } from '@procircuit/actions';
import { createMockInsightClient } from '@procircuit/agents';
import type { InsightModelClient } from '@procircuit/agents';
import { describe, expect, it } from 'vitest';
import { FakeDb } from '../test-support/fake-db';
import { runMindsetCoach } from './run';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

function fakeAgentRunsDb() {
  const rows: AgentRunInsert[] = [];
  const db: AgentRunsDb = {
    async insertAgentRun(row) {
      rows.push(row);
    },
  };
  return { db, rows };
}

function seedPlayer(fake: FakeDb, overrides: Record<string, unknown> = {}) {
  fake.tables.players = [
    {
      id: 'player-1',
      timezone: 'Australia/Sydney',
      patron_language: 'en',
      app_language: 'en',
      ...overrides,
    },
  ];
}

function seedNotes(fake: FakeDb, count = 3) {
  fake.tables.notes = Array.from({ length: count }, (_, i) => ({
    id: `note-${i}`,
    player_id: 'player-1',
    status: 'saved',
    recorded_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
    ctx: 'practice',
    result: null,
    mood: 'confident',
    tags: [],
    transcript: null,
    summary: 'A note.',
    cond: null,
  }));
}

const NOW = new Date('2026-09-21T20:00:00Z'); // 06:00 AEST on 22 Sep

describe('runMindsetCoach', () => {
  it('writes one insight row and one notification on a normal delivered morning', async () => {
    const fake = new FakeDb();
    seedPlayer(fake);
    seedNotes(fake);
    const { db: agentRuns, rows } = fakeAgentRunsDb();

    await runMindsetCoach(
      { db: asDb(fake), client: createMockInsightClient(), agentRuns },
      'player-1',
      NOW,
    );

    expect(fake.tables.insights ?? []).toHaveLength(1);
    expect(fake.tables.insights![0]!.delivery).toBe('delivered');
    expect(fake.tables.notifications ?? []).toHaveLength(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('succeeded');
  });

  it('MC-15: a paused player gets no insight row and no model call', async () => {
    const fake = new FakeDb();
    seedPlayer(fake);
    seedNotes(fake);
    fake.tables.mindset_boundaries = [
      {
        player_id: 'player-1',
        paused_until: '2026-09-25',
        quiet_match_mornings: true,
        coach_sees_patterns: true,
      },
    ];
    const { db: agentRuns, rows } = fakeAgentRunsDb();
    let called = false;
    const client: InsightModelClient = {
      async complete() {
        called = true;
        return { raw: { body: ['x'], focus: null }, usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };

    await runMindsetCoach({ db: asDb(fake), client, agentRuns }, 'player-1', NOW);

    expect(called).toBe(false);
    expect(fake.tables.insights ?? []).toHaveLength(0);
    expect(rows).toHaveLength(0);
  });

  it('MC-1: a second run with unchanged inputs does not regenerate', async () => {
    const fake = new FakeDb();
    seedPlayer(fake);
    seedNotes(fake);
    const { db: agentRuns, rows } = fakeAgentRunsDb();
    const client = createMockInsightClient();

    await runMindsetCoach({ db: asDb(fake), client, agentRuns }, 'player-1', NOW);
    await runMindsetCoach({ db: asDb(fake), client, agentRuns }, 'player-1', NOW);

    expect(fake.tables.insights).toHaveLength(1);
    expect(rows).toHaveLength(1); // only the first run actually called the model
  });

  it('M-PRIV-3: a distress signal opens a case and skips the model', async () => {
    const fake = new FakeDb();
    seedPlayer(fake);
    fake.tables.notes = [
      {
        id: 'note-1',
        player_id: 'player-1',
        status: 'saved',
        recorded_at: NOW.toISOString(),
        ctx: 'other',
        result: null,
        mood: null,
        tags: [],
        transcript: "I don't want to be here anymore",
        summary: null,
        cond: null,
      },
    ];
    const { db: agentRuns, rows } = fakeAgentRunsDb();
    let called = false;
    const client: InsightModelClient = {
      async complete() {
        called = true;
        return { raw: { body: ['x'], focus: null }, usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };

    await runMindsetCoach({ db: asDb(fake), client, agentRuns }, 'player-1', NOW);

    expect(called).toBe(false);
    expect(fake.tables.cases ?? []).toHaveLength(1);
    expect(fake.tables.cases![0]!.kind).toBe('distress');
    expect(fake.tables.insights![0]!.delivery).toBe('distress');
    expect(fake.tables.notifications![0]!.body).toBe('Something for you this morning');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('succeeded');
  });

  it('does nothing for a player with no players row yet (pre-onboarding)', async () => {
    const fake = new FakeDb();
    const { db: agentRuns, rows } = fakeAgentRunsDb();

    await runMindsetCoach(
      { db: asDb(fake), client: createMockInsightClient(), agentRuns },
      'ghost-player',
      NOW,
    );

    expect(fake.tables.insights ?? []).toHaveLength(0);
    expect(rows).toHaveLength(0);
  });
});
