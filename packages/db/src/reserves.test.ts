import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { InvalidReserveAmountError, enterReserveBalance } from './reserves';
import type { Database } from './database.types';

function fakeQuery(results: { data: unknown; error: Error | null }[]) {
  const query: Record<string, unknown> = {};
  const chain = ['select', 'eq', 'insert', 'order', 'limit'];
  for (const method of chain) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  let call = 0;
  const next = () => results[Math.min(call++, results.length - 1)];
  query.single = vi.fn().mockImplementation(() => Promise.resolve(next()));
  query.maybeSingle = vi.fn().mockImplementation(() => Promise.resolve(next()));
  return query;
}

describe('enterReserveBalance', () => {
  it('refuses a zero amount (F-3: requires a non-zero amount)', async () => {
    const client = {} as SupabaseClient<Database>;
    await expect(
      enterReserveBalance(client, { playerId: 'player-1', amount: 0, currency: 'AUD' }),
    ).rejects.toThrow(InvalidReserveAmountError);
  });

  it('records the previous balance from the latest existing row, then inserts the new one with cause=player', async () => {
    const query = fakeQuery([
      { data: { amount: 9450 }, error: null }, // getLatestReserveBalance
      { data: { id: 'entry-2', amount: 10450, previous_amount: 9450 }, error: null }, // insert
    ]);
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    const result = await enterReserveBalance(client, {
      playerId: 'player-1',
      amount: 10450,
      currency: 'AUD',
    });

    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        player_id: 'player-1',
        amount: 10450,
        previous_amount: 9450,
        cause: 'player',
      }),
    );
    expect(result.amount).toBe(10450);
  });

  it('a player with no prior entry gets previous_amount null, not zero', async () => {
    const query = fakeQuery([
      { data: null, error: null }, // getLatestReserveBalance: no rows yet
      { data: { id: 'entry-1', amount: 500, previous_amount: null }, error: null },
    ]);
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await enterReserveBalance(client, { playerId: 'player-1', amount: 500, currency: 'AUD' });

    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ previous_amount: null }));
  });
});
