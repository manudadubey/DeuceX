import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// A player's own plan changes that never reach Stripe (docs/BILLING-DECISIONS.md):
// starting the once-per-player trial, and dropping a card-less trial to Free.
// Both are security-definer database functions, since players can no longer
// write tier, tier_status or billing_cycle themselves (the billing_trials
// migration). Anything with a card on file goes through apps/api instead.

export class TrialUnavailableError extends Error {
  constructor() {
    super('The free trial has already been used on this account.');
    this.name = 'TrialUnavailableError';
  }
}

export class SubscriptionActiveError extends Error {
  constructor() {
    super('This plan has a card on file, so it ends through Stripe.');
    this.name = 'SubscriptionActiveError';
  }
}

/** Starts the 14-day trial. Returns when it ends. */
export async function startTrial(
  client: SupabaseClient<Database>,
  plan: 'pro' | 'elite',
  cycle: 'monthly' | 'annual',
): Promise<string> {
  const { data, error } = await client.rpc('start_trial', { p_plan: plan, p_cycle: cycle });
  if (error) {
    if (error.message.includes('trial_unavailable')) throw new TrialUnavailableError();
    throw error;
  }
  return data;
}

/** Plan & billing's "Downgrade to Free" for a trial with no card: takes effect now. */
export async function downgradeToFree(client: SupabaseClient<Database>): Promise<void> {
  const { error } = await client.rpc('downgrade_to_free');
  if (error) {
    if (error.message.includes('subscription_active')) throw new SubscriptionActiveError();
    throw error;
  }
}
