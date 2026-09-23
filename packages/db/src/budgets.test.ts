import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  InvalidBudgetEstimateAmountError,
  InvalidWeeklyBudgetAmountError,
  createBudgetEstimate,
  listActiveFinancialActionSnoozes,
  listCurrentBudgetEstimates,
  setWeeklyBudget,
  snoozeFinancialAction,
} from './budgets';
import type { Database } from './database.types';

// Same shape as ledger.test.ts's own fakeQuery: proves the filters and
// payload shapes this module builds, not the database itself.
function fakeQuery(result: { data: unknown; error: Error | null }) {
  const query: Record<string, unknown> = {};
  const chain = ['select', 'eq', 'insert', 'update', 'order', 'gt'];
  for (const method of chain) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.single = vi.fn().mockResolvedValue(result);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  (query as unknown as { then: PromiseLike<unknown>['then'] }).then = (resolve) =>
    Promise.resolve(result).then(resolve as never);
  return query;
}

describe('createBudgetEstimate', () => {
  it('refuses a non-positive estimate', async () => {
    const client = {} as SupabaseClient<Database>;
    await expect(
      createBudgetEstimate(client, {
        playerId: 'player-1',
        label: 'Genoa',
        estimateAmount: 0,
        currency: 'AUD',
      }),
    ).rejects.toThrow(InvalidBudgetEstimateAmountError);
  });

  it('inserts an active row', async () => {
    const query = fakeQuery({ data: { id: 'est-1' }, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await createBudgetEstimate(client, {
      playerId: 'player-1',
      label: 'Genoa',
      estimateAmount: 1900,
      currency: 'AUD',
    });

    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        player_id: 'player-1',
        label: 'Genoa',
        estimate_amount: 1900,
        currency: 'AUD',
        status: 'active',
      }),
    );
  });
});

describe('listCurrentBudgetEstimates', () => {
  it('keeps only the latest row per label (PRD-03 F-16: a revision is a new row)', async () => {
    const query = fakeQuery({
      data: [
        { label: 'Genoa', estimate_amount: 1900, estimated_at: '2026-09-15T00:00:00Z' },
        { label: 'Genoa', estimate_amount: 1500, estimated_at: '2026-09-01T00:00:00Z' },
        { label: 'Sibiu', estimate_amount: 960, estimated_at: '2026-09-10T00:00:00Z' },
      ],
      error: null,
    });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    const rows = await listCurrentBudgetEstimates(client, 'player-1');

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.label === 'Genoa')?.estimate_amount).toBe(1900);
    expect(rows.find((r) => r.label === 'Sibiu')?.estimate_amount).toBe(960);
  });
});

describe('setWeeklyBudget', () => {
  it('refuses a non-positive amount', async () => {
    const client = {} as SupabaseClient<Database>;
    await expect(setWeeklyBudget(client, 'player-1', 0)).rejects.toThrow(
      InvalidWeeklyBudgetAmountError,
    );
  });

  it('allows null to clear the budget', async () => {
    const query = fakeQuery({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await setWeeklyBudget(client, 'player-1', null);

    expect(query.update).toHaveBeenCalledWith({ weekly_budget: null });
  });

  it('updates players.weekly_budget, not a separate table', async () => {
    const query = fakeQuery({ data: null, error: null });
    const from = vi.fn().mockReturnValue(query);
    const client = { from } as unknown as SupabaseClient<Database>;

    await setWeeklyBudget(client, 'player-1', 1200);

    expect(from).toHaveBeenCalledWith('players');
    expect(query.update).toHaveBeenCalledWith({ weekly_budget: 1200 });
  });
});

describe('snoozeFinancialAction', () => {
  it('inserts a snooze row', async () => {
    const query = fakeQuery({ data: { id: 'snooze-1' }, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await snoozeFinancialAction(client, {
      playerId: 'player-1',
      candidateKey: 'publish_patron_update',
      snoozedUntil: '2026-09-28T07:00:00Z',
    });

    expect(query.insert).toHaveBeenCalledWith({
      player_id: 'player-1',
      candidate_key: 'publish_patron_update',
      snoozed_until: '2026-09-28T07:00:00Z',
    });
  });
});

describe('listActiveFinancialActionSnoozes', () => {
  it('keeps only the latest row per candidate_key', async () => {
    const query = fakeQuery({
      data: [
        {
          candidate_key: 'update_balance',
          snoozed_until: '2026-09-28T07:00:00Z',
          created_at: '2026-09-21T09:00:00Z',
        },
        {
          candidate_key: 'update_balance',
          snoozed_until: '2026-09-21T07:00:00Z',
          created_at: '2026-09-14T09:00:00Z',
        },
      ],
      error: null,
    });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    const rows = await listActiveFinancialActionSnoozes(client, 'player-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.snoozed_until).toBe('2026-09-28T07:00:00Z');
  });
});
