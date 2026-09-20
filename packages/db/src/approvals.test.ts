import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createApproval } from './approvals';
import type { Database } from './database.types';

// A minimal fake of the one chain createApproval calls
// (`.from('approvals').insert(...).select('id').single()`), not a real
// PostgREST client — proving the payload shape and the returned hash, not
// the database itself (that's what the migration and RLS policies do).
function fakeClient(row: { id: string } | null, error: Error | null) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: row, error }),
    }),
  });
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as unknown as SupabaseClient<Database>, from, insert };
}

describe('createApproval', () => {
  it('inserts with approved_by pinned to the same player (RLS requires both to match)', async () => {
    const { client, from, insert } = fakeClient({ id: 'approval-1' }, null);

    const result = await createApproval(client, {
      playerId: 'player-1',
      actionType: 'expense_save',
      payload: { amount: 1360, currency: 'AUD' },
    });

    expect(from).toHaveBeenCalledWith('approvals');
    expect(insert).toHaveBeenCalledWith({
      player_id: 'player-1',
      approved_by: 'player-1',
      action_type: 'expense_save',
      payload: { amount: 1360, currency: 'AUD' },
      agent_run_id: null,
      device: null,
    });
    expect(result.id).toBe('approval-1');
  });

  it('returns a hash matching hashApprovalPayload for the same payload', async () => {
    const { client } = fakeClient({ id: 'approval-2' }, null);
    const payload = { amount: 42, currency: 'USD' };

    const { hashApprovalPayload } = await import('@procircuit/shared');
    const result = await createApproval(client, {
      playerId: 'player-1',
      actionType: 'expense_save',
      payload,
    });

    expect(result.payloadHash).toBe(await hashApprovalPayload(payload));
  });

  it('throws when the insert fails (e.g. RLS rejects it)', async () => {
    const { client } = fakeClient(null, new Error('new row violates row-level security policy'));

    await expect(
      createApproval(client, {
        playerId: 'player-1',
        actionType: 'expense_save',
        payload: {},
      }),
    ).rejects.toThrow('row-level security');
  });
});
