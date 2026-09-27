import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  SubscriptionActiveError,
  TrialUnavailableError,
  downgradeToFree,
  startTrial,
} from './billing';
import type { Database } from './database.types';

function clientWith(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe('startTrial', () => {
  it('calls start_trial and returns the end date', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: '2026-10-11T10:00:00Z', error: null });
    await expect(startTrial(clientWith(rpc), 'elite', 'monthly')).resolves.toBe(
      '2026-10-11T10:00:00Z',
    );
    expect(rpc).toHaveBeenCalledWith('start_trial', { p_plan: 'elite', p_cycle: 'monthly' });
  });

  it('names a used trial', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'trial_unavailable' } });
    await expect(startTrial(clientWith(rpc), 'pro', 'monthly')).rejects.toBeInstanceOf(
      TrialUnavailableError,
    );
  });
});

describe('downgradeToFree', () => {
  it('calls downgrade_to_free', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await downgradeToFree(clientWith(rpc));
    expect(rpc).toHaveBeenCalledWith('downgrade_to_free');
  });

  it('names a plan that has to end through Stripe', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'subscription_active' } });
    await expect(downgradeToFree(clientWith(rpc))).rejects.toBeInstanceOf(SubscriptionActiveError);
  });
});
