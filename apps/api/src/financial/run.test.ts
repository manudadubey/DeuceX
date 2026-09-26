import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { AgentRunInsert, AgentRunsDb } from '@deucex/actions';
import { createMockFinancialActionClient } from '@deucex/agents';
import type { FinancialActionModelClient } from '@deucex/agents';
import { describe, expect, it, vi } from 'vitest';
import { FakeDb } from '../test-support/fake-db';
import { runFinancialAgent } from './run';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

// Mirrors what SupabaseAgentRunsDb writes, but against the same FakeDb
// table run.ts's own getLatestFinancialAction reads from (agent_runs) —
// exactly how production's single real Supabase client behaves, just
// without a live Postgres connection.
function fakeAgentRunsDb(fake: FakeDb): AgentRunsDb {
  return {
    async insertAgentRun(row: AgentRunInsert) {
      (fake.tables.agent_runs ??= []).push({
        id: `run-${(fake.tables.agent_runs ?? []).length}`,
        agent_name: row.agentName,
        player_id: row.playerId,
        trigger_type: row.triggerType,
        started_at: row.startedAt.toISOString(),
        status: row.status,
        inputs_hash: row.inputsHash,
        output: row.output,
      });
    },
  };
}

function seedPlayer(fake: FakeDb, overrides: Record<string, unknown> = {}) {
  fake.tables.players = [
    { id: 'player-1', home_currency: 'AUD', weekly_budget: 1200, tier: 'pro', ...overrides },
  ];
}

const NOW = new Date('2026-09-21T07:00:00Z');

describe('runFinancialAgent', () => {
  it('generates a fresh action and sends one notification on a scheduled run', async () => {
    const fake = new FakeDb();
    seedPlayer(fake);
    const client = createMockFinancialActionClient();
    const agentRuns = fakeAgentRunsDb(fake);

    const result = await runFinancialAgent(
      { db: asDb(fake), client, agentRuns },
      'player-1',
      'schedule',
      NOW,
    );

    expect(result?.cached).toBe(false);
    expect(fake.tables.agent_runs).toHaveLength(1);
    expect(fake.tables.notifications).toHaveLength(1);
    expect(fake.tables.notifications?.[0]?.agent).toBe('financial');
  });

  it('does not send a notification on an event-triggered run', async () => {
    const fake = new FakeDb();
    seedPlayer(fake);
    const client = createMockFinancialActionClient();
    const agentRuns = fakeAgentRunsDb(fake);

    await runFinancialAgent({ db: asDb(fake), client, agentRuns }, 'player-1', 'event', NOW);

    expect(fake.tables.notifications ?? []).toHaveLength(0);
  });

  it('reuses the cached action and skips the model call when the winning candidate is unchanged (F-3\'s "live runs recompute figures without regenerating the action")', async () => {
    const fake = new FakeDb();
    seedPlayer(fake);
    const agentRuns = fakeAgentRunsDb(fake);
    const complete = vi.fn(async () => ({
      raw: { text: 'Update your balance.', secondSentence: null },
      usage: { inputTokens: 1, outputTokens: 1 },
    }));
    const client: FinancialActionModelClient = { complete };

    const first = await runFinancialAgent(
      { db: asDb(fake), client, agentRuns },
      'player-1',
      'schedule',
      NOW,
    );
    expect(first?.cached).toBe(false);
    expect(complete).toHaveBeenCalledTimes(1);

    const second = await runFinancialAgent(
      { db: asDb(fake), client, agentRuns },
      'player-1',
      'event',
      new Date(NOW.getTime() + 60 * 1000),
    );

    expect(second?.cached).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1); // no second model call
    expect(fake.tables.agent_runs).toHaveLength(1); // no second audit row either
  });

  it('PRD-13 AD-13: a chase run records which receivable it proposed chasing, so "Mark received" can link it', async () => {
    const fake = new FakeDb();
    seedPlayer(fake);
    fake.tables.reserve_entries = [
      { player_id: 'player-1', amount: 10000, entered_at: NOW.toISOString(), cause: 'manual' },
    ];
    fake.tables.ledger_lines = [
      {
        id: 'l-1',
        player_id: 'player-1',
        date: '2026-09-15',
        category: 'travel',
        what: 'Flights',
        amount_original: 3000,
        currency_original: 'AUD',
        fx_rate_date: '2026-09-15',
        tournament_id: null,
      },
    ];
    fake.tables.prize_receivables = [
      {
        id: 'pz-1',
        player_id: 'player-1',
        status: 'pending',
        tournament_id: null,
        round: 'QF',
        gross_amount: 2000,
        player_share: 1,
        withholding_amount: 0,
        currency: 'AUD',
        expected_date: '2026-09-01',
      },
    ];
    fake.tables.fx_rates_daily = [
      { date: '2026-09-15', currency: 'AUD', rate_to_eur: 1.6, source: 'ecb' },
      { date: '2026-09-21', currency: 'AUD', rate_to_eur: 1.6, source: 'ecb' },
    ];
    const agentRuns = fakeAgentRunsDb(fake);

    const result = await runFinancialAgent(
      { db: asDb(fake), client: createMockFinancialActionClient(), agentRuns },
      'player-1',
      'event',
      NOW,
    );

    expect(result?.action.candidateKey).toBe('chase_overdue_receivable');
    expect(fake.tables.agent_runs?.[0]?.output).toMatchObject({ receivableId: 'pz-1' });
  });

  it('records no receivable for any other action', async () => {
    const fake = new FakeDb();
    seedPlayer(fake);
    const agentRuns = fakeAgentRunsDb(fake);

    await runFinancialAgent(
      { db: asDb(fake), client: createMockFinancialActionClient(), agentRuns },
      'player-1',
      'event',
      NOW,
    );

    expect(fake.tables.agent_runs?.[0]?.output).toMatchObject({
      candidateKey: 'update_balance',
      receivableId: null,
    });
  });

  it('returns null for an unknown player rather than throwing', async () => {
    const fake = new FakeDb();
    const client = createMockFinancialActionClient();
    const agentRuns = fakeAgentRunsDb(fake);

    const result = await runFinancialAgent(
      { db: asDb(fake), client, agentRuns },
      'ghost-player',
      'schedule',
      NOW,
    );

    expect(result).toBeNull();
  });
});
