import { describe, expect, it, vi } from 'vitest';

const fakeSupabase = { marker: 'fake-browser-client' };
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => fakeSupabase,
}));

const createApproval = vi.fn().mockResolvedValue({ id: 'approval-1', payloadHash: 'hash-1' });
vi.mock('@procircuit/db', () => ({ createApproval }));

const { confirmApproval } = await import('./confirm-approval');

describe('confirmApproval', () => {
  it('creates the approval through the browser client, with the device string attached', async () => {
    const result = await confirmApproval({
      playerId: 'player-1',
      actionType: 'expense_save',
      payload: { amount: 1360, currency: 'AUD' },
    });

    expect(createApproval).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({
        playerId: 'player-1',
        actionType: 'expense_save',
        payload: { amount: 1360, currency: 'AUD' },
        agentRunId: undefined,
      }),
    );
    expect(result).toEqual({ id: 'approval-1', payloadHash: 'hash-1' });
  });
});
