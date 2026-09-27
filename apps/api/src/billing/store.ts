import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { LIVE_SUBSCRIPTION_STATUSES, type BillingSubscriptionRow } from '@deucex/actions/billing';
import type { BillingCycle, PaidPlan } from '@deucex/shared';
import {
  toTrialPlayer,
  type BillingNotice,
  type BillingSweepStore,
  type TrialPlayer,
} from './sweep';

const TRIAL_COLUMNS = 'id, name, tier, billing_cycle, trial_ends_at, timezone';

// The service-role reads and writes behind the hourly billing sweep.
export class SupabaseBillingSweepStore implements BillingSweepStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private async withLiveSubscription(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const { data, error } = await this.db
      .from('billing_subscriptions')
      .select('player_id')
      .in('player_id', ids)
      .in('status', [...LIVE_SUBSCRIPTION_STATUSES]);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.player_id));
  }

  async listTrialsToRemind(now: Date, until: Date): Promise<TrialPlayer[]> {
    const { data, error } = await this.db
      .from('players')
      .select(TRIAL_COLUMNS)
      .eq('tier_status', 'trialing')
      .is('trial_reminded_at', null)
      .gt('trial_ends_at', now.toISOString())
      .lte('trial_ends_at', until.toISOString());
    if (error) throw error;
    const trials = (data ?? []).map(toTrialPlayer).filter((p): p is TrialPlayer => p !== null);
    const carded = await this.withLiveSubscription(trials.map((p) => p.id));
    return trials.filter((p) => !carded.has(p.id));
  }

  async markReminded(playerId: string, at: Date): Promise<void> {
    const { error } = await this.db
      .from('players')
      .update({ trial_reminded_at: at.toISOString() })
      .eq('id', playerId);
    if (error) throw error;
  }

  async listEndedTrials(now: Date): Promise<TrialPlayer[]> {
    const { data, error } = await this.db
      .from('players')
      .select(TRIAL_COLUMNS)
      .eq('tier_status', 'trialing')
      .lte('trial_ends_at', now.toISOString());
    if (error) throw error;
    return (data ?? []).map(toTrialPlayer).filter((p): p is TrialPlayer => p !== null);
  }

  async listDueCancellations(now: Date): Promise<BillingSubscriptionRow[]> {
    const { data, error } = await this.db
      .from('billing_subscriptions')
      .select('*')
      .eq('cancel_at_period_end', true)
      .lte('current_period_end', now.toISOString())
      .in('status', [...LIVE_SUBSCRIPTION_STATUSES]);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      playerId: r.player_id,
      stripeSubscriptionId: r.stripe_subscription_id,
      stripeCustomerId: r.stripe_customer_id,
      plan: r.plan as PaidPlan,
      billingCycle: r.billing_cycle as BillingCycle,
      status: r.status,
      trialEnd: r.trial_end,
      currentPeriodEnd: r.current_period_end,
      cancelAtPeriodEnd: r.cancel_at_period_end,
    }));
  }

  async countPayingPatrons(playerId: string): Promise<number> {
    const { count, error } = await this.db
      .from('patrons')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .in('status', ['active', 'past_due']);
    if (error) throw error;
    return count ?? 0;
  }

  // Delivered by email and push through step 5.2's notification sweep.
  async notify(playerId: string, notice: BillingNotice): Promise<void> {
    const { error } = await this.db.from('notifications').insert({
      player_id: playerId,
      agent: 'deucex',
      category: 'for_you',
      title: notice.title,
      body: notice.body,
      action_href: notice.href,
    });
    if (error) throw error;
  }
}
