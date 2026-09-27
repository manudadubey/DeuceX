import type { Database, Json } from '@deucex/db';
import {
  isBillingCycle,
  isPaidPlan,
  planPriceLookupKey,
  type BillingCycle,
  type PaidPlan,
} from '@deucex/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type ApprovalGateDb, runGatedAction } from './gate';
import type { BillingStripeClient, PlanSubscriptionSummary } from './stripe-client';

// A player's own DeuceX plan (docs/BILLING-DECISIONS.md). Two gated actions,
// the same shape as receivables.ts and fans.ts, with the same discipline:
// the price, the trial end and the customer come from the server's own rows
// and Stripe, never the approval payload, which only names the plan and
// cycle the player chose.
//
//   subscription_checkout  startSubscriptionCheckout  Stripe customer + Checkout session
//   subscription_cancel    cancelPlan                 Stripe cancel (now, or at period end)
//
// completeSubscriptionCheckout has no approval of its own on purpose: it
// only reads back what the player already approved and then did on Stripe's
// own page, the same trust model as Fans' checkout-return reconcile.
//
// Trials themselves never reach Stripe (decision 1A): a trial is a row in
// players, started by the start_trial database function. The first Stripe
// object for a player is the customer made here, when they choose to pay.

/** Stripe Checkout refuses a trial end too close to now; this keeps a margin above its 48-hour minimum. */
export const CHECKOUT_MIN_TRIAL_LEAD_MS = (48 * 60 + 10) * 60 * 1000;

/** Stripe statuses that mean a subscription is still live (charging or about to). */
export const LIVE_SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'unpaid'] as const;

export class BillingPlayerMissingError extends Error {
  constructor(readonly playerId: string) {
    super(`No player ${playerId}`);
    this.name = 'BillingPlayerMissingError';
  }
}

export class AlreadySubscribedError extends Error {
  constructor(readonly playerId: string) {
    super('This account already has a paid plan.');
    this.name = 'AlreadySubscribedError';
  }
}

export class PlanChangeUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'PlanChangeUnavailableError';
  }
}

export class PlanPriceMissingError extends Error {
  constructor(readonly lookupKey: string) {
    super(`No active Stripe price with lookup key ${lookupKey}`);
    this.name = 'PlanPriceMissingError';
  }
}

export class NoSubscriptionError extends Error {
  constructor(readonly playerId: string) {
    super('This account has no paid plan to end.');
    this.name = 'NoSubscriptionError';
  }
}

export class CheckoutNotYoursError extends Error {
  constructor() {
    super('That checkout belongs to a different account.');
    this.name = 'CheckoutNotYoursError';
  }
}

export interface BillingPlayer {
  id: string;
  name: string;
  email: string;
  tier: string | null;
  tierStatus: string | null;
  billingCycle: string | null;
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
}

export interface BillingSubscriptionRow {
  playerId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  plan: PaidPlan;
  billingCycle: BillingCycle;
  status: string;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export type BillingEventKind =
  | 'trial_started'
  | 'trial_reminder'
  | 'trial_lapsed'
  | 'patron_billing_auto_paused'
  | 'checkout_completed'
  | 'subscription_active'
  | 'subscription_cancel_requested'
  | 'downgraded';

export interface BillingActionsDb {
  getPlayer(playerId: string): Promise<BillingPlayer | null>;
  setStripeCustomerId(playerId: string, customerId: string): Promise<void>;
  getSubscription(playerId: string): Promise<BillingSubscriptionRow | null>;
  upsertSubscription(row: BillingSubscriptionRow): Promise<void>;
  setPlan(
    playerId: string,
    plan: { tier: string; tierStatus: string; billingCycle?: BillingCycle },
  ): Promise<void>;
  addEvent(playerId: string, kind: BillingEventKind, detail: Json): Promise<void>;
}

export function isLiveSubscriptionStatus(status: string): boolean {
  return (LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

/** players.tier_status for a Stripe subscription status, or null when the plan has ended. */
export function tierStatusForSubscription(
  status: string,
): 'trialing' | 'active' | 'past_due' | null {
  if (status === 'trialing') return 'trialing';
  if (status === 'active') return 'active';
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  return null;
}

/**
 * When the first charge lands for a player paying from inside their trial:
 * the trial's own end, or Stripe's minimum lead if that's sooner, so paying
 * on day 13 gives up to a day extra rather than failing (decision 1A).
 * Null when there's no trial left: the charge is at once.
 */
export function checkoutTrialEnd(player: BillingPlayer, now: Date): number | null {
  if (player.tierStatus !== 'trialing' || !player.trialEndsAt) return null;
  const trialEnd = new Date(player.trialEndsAt).getTime();
  if (trialEnd <= now.getTime()) return null;
  const earliest = now.getTime() + CHECKOUT_MIN_TRIAL_LEAD_MS;
  return Math.ceil(Math.max(trialEnd, earliest) / 1000);
}

export interface SubscriptionCheckoutPayload {
  plan: PaidPlan;
  cycle: BillingCycle;
}

export function subscriptionCheckoutPayload(input: SubscriptionCheckoutPayload): Json {
  return { plan: input.plan, cycle: input.cycle };
}

export interface StartSubscriptionCheckoutInput {
  approvalId: string;
  playerId: string;
  plan: PaidPlan;
  cycle: BillingCycle;
  appBaseUrl: string;
  now?: Date;
}

export async function startSubscriptionCheckout(
  gateDb: ApprovalGateDb,
  db: BillingActionsDb,
  stripe: BillingStripeClient,
  input: StartSubscriptionCheckoutInput,
): Promise<{ url: string }> {
  if (!isPaidPlan(input.plan) || !isBillingCycle(input.cycle)) {
    throw new PlanChangeUnavailableError('Choose Pro or Elite, monthly or yearly.');
  }
  return runGatedAction(
    gateDb,
    {
      approvalId: input.approvalId,
      playerId: input.playerId,
      actionType: 'subscription_checkout',
      payload: subscriptionCheckoutPayload(input),
    },
    async () => {
      const player = await db.getPlayer(input.playerId);
      if (!player) throw new BillingPlayerMissingError(input.playerId);
      if (player.tierStatus === 'comped') {
        throw new PlanChangeUnavailableError(
          'Your plan is complimentary at the moment, so there is nothing to pay.',
        );
      }
      const existing = await db.getSubscription(input.playerId);
      if (existing && isLiveSubscriptionStatus(existing.status)) {
        throw new AlreadySubscribedError(input.playerId);
      }

      const lookupKey = planPriceLookupKey(input.plan, input.cycle);
      const price = await stripe.findPriceByLookupKey(lookupKey);
      if (!price) throw new PlanPriceMissingError(lookupKey);

      let customerId = player.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.createCustomer({
          email: player.email,
          name: player.name,
          metadata: { deucex_player_id: player.id },
        });
        customerId = customer.id;
        await db.setStripeCustomerId(player.id, customerId);
      }

      const metadata = { deucex_player_id: player.id, plan: input.plan, cycle: input.cycle };
      const base = `${input.appBaseUrl}/settings?pane=billing`;
      return stripe.createPlanCheckoutSession({
        customerId,
        priceId: price.id,
        trialEnd: checkoutTrialEnd(player, input.now ?? new Date()),
        // Stripe fills {CHECKOUT_SESSION_ID} in itself; it must stay unencoded.
        successUrl: `${base}&checkout={CHECKOUT_SESSION_ID}`,
        cancelUrl: base,
        metadata,
      });
    },
  );
}

export type CompleteCheckoutResult =
  | { state: 'open' }
  | {
      state: 'complete';
      plan: PaidPlan;
      cycle: BillingCycle;
      tierStatus: string;
      firstChargeAt: string | null;
    };

function rowFromSubscription(
  playerId: string,
  sub: PlanSubscriptionSummary,
  plan: PaidPlan,
  cycle: BillingCycle,
): BillingSubscriptionRow {
  return {
    playerId,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: sub.customerId,
    plan,
    billingCycle: cycle,
    status: sub.status,
    trialEnd: sub.trialEnd,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}

/** Back from Stripe Checkout: records the subscription and moves the plan. Idempotent. */
export async function completeSubscriptionCheckout(
  db: BillingActionsDb,
  stripe: BillingStripeClient,
  input: { playerId: string; sessionId: string },
): Promise<CompleteCheckoutResult> {
  const session = await stripe.retrievePlanCheckoutSession(input.sessionId);
  if (session.metadata.deucex_player_id !== input.playerId) throw new CheckoutNotYoursError();
  if (session.status !== 'complete' || !session.subscriptionId) return { state: 'open' };

  const plan = session.metadata.plan;
  const cycle = session.metadata.cycle;
  if (!isPaidPlan(plan) || !isBillingCycle(cycle)) {
    throw new PlanChangeUnavailableError('That checkout has no plan on it.');
  }
  const sub = await stripe.retrievePlanSubscription(session.subscriptionId);
  const tierStatus = tierStatusForSubscription(sub.status) ?? 'active';

  const before = await db.getSubscription(input.playerId);
  await db.upsertSubscription(rowFromSubscription(input.playerId, sub, plan, cycle));
  await db.setPlan(input.playerId, { tier: plan, tierStatus, billingCycle: cycle });
  if (before?.stripeSubscriptionId !== sub.id) {
    await db.addEvent(input.playerId, 'checkout_completed', {
      plan,
      cycle,
      subscription: sub.id,
      first_charge_at: sub.trialEnd,
    });
  }
  return { state: 'complete', plan, cycle, tierStatus, firstChargeAt: sub.trialEnd };
}

export interface CancelPlanInput {
  approvalId: string;
  playerId: string;
}

export interface CancelPlanResult {
  /** 'now' when nothing had been charged yet (still in the trial); otherwise the paid period runs out. */
  effective: 'now' | 'period_end';
  effectiveAt: string | null;
}

/**
 * "Downgrade to Free" for a player with a card on file (PRD-12's rule: a
 * paid plan ends at the end of its period, never at once). Inside the trial
 * nothing has been charged, so it ends now. The patron-billing pause that
 * M-TIER-2 asks for is its own gated action (patron_billing_pause), run by
 * the caller first, the same order Settings already uses.
 */
export async function cancelPlan(
  gateDb: ApprovalGateDb,
  db: BillingActionsDb,
  stripe: BillingStripeClient,
  input: CancelPlanInput,
): Promise<CancelPlanResult> {
  return runGatedAction(
    gateDb,
    {
      approvalId: input.approvalId,
      playerId: input.playerId,
      actionType: 'subscription_cancel',
      payload: {},
    },
    async () => {
      const row = await db.getSubscription(input.playerId);
      if (!row || !isLiveSubscriptionStatus(row.status)) {
        throw new NoSubscriptionError(input.playerId);
      }
      const current = await stripe.retrievePlanSubscription(row.stripeSubscriptionId);
      const now = current.status === 'trialing';
      const updated = await stripe.cancelPlanSubscription({
        subscriptionId: row.stripeSubscriptionId,
        atPeriodEnd: !now,
      });
      await db.upsertSubscription(
        rowFromSubscription(input.playerId, updated, row.plan, row.billingCycle),
      );
      if (now) {
        await db.setPlan(input.playerId, { tier: 'free', tierStatus: 'free' });
        await db.addEvent(input.playerId, 'downgraded', {
          immediate: true,
          subscription: updated.id,
        });
        return { effective: 'now', effectiveAt: null };
      }
      await db.addEvent(input.playerId, 'subscription_cancel_requested', {
        subscription: updated.id,
        effective_at: updated.currentPeriodEnd,
      });
      return { effective: 'period_end', effectiveAt: updated.currentPeriodEnd };
    },
  );
}

// ---------------------------------------------------------------------------
// The Supabase-backed implementation (service role, apps/api only).
// ---------------------------------------------------------------------------

export class SupabaseBillingActionsDb implements BillingActionsDb {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getPlayer(playerId: string): Promise<BillingPlayer | null> {
    const { data, error } = await this.client
      .from('players')
      .select(
        'id, name, email, tier, tier_status, billing_cycle, trial_ends_at, stripe_customer_id',
      )
      .eq('id', playerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      tier: data.tier,
      tierStatus: data.tier_status,
      billingCycle: data.billing_cycle,
      trialEndsAt: data.trial_ends_at,
      stripeCustomerId: data.stripe_customer_id,
    };
  }

  async setStripeCustomerId(playerId: string, customerId: string): Promise<void> {
    const { error } = await this.client
      .from('players')
      .update({ stripe_customer_id: customerId })
      .eq('id', playerId);
    if (error) throw error;
  }

  async getSubscription(playerId: string): Promise<BillingSubscriptionRow | null> {
    const { data, error } = await this.client
      .from('billing_subscriptions')
      .select('*')
      .eq('player_id', playerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      playerId: data.player_id,
      stripeSubscriptionId: data.stripe_subscription_id,
      stripeCustomerId: data.stripe_customer_id,
      plan: data.plan as PaidPlan,
      billingCycle: data.billing_cycle as BillingCycle,
      status: data.status,
      trialEnd: data.trial_end,
      currentPeriodEnd: data.current_period_end,
      cancelAtPeriodEnd: data.cancel_at_period_end,
    };
  }

  async upsertSubscription(row: BillingSubscriptionRow): Promise<void> {
    const { error } = await this.client.from('billing_subscriptions').upsert(
      {
        player_id: row.playerId,
        stripe_subscription_id: row.stripeSubscriptionId,
        stripe_customer_id: row.stripeCustomerId,
        plan: row.plan,
        billing_cycle: row.billingCycle,
        status: row.status,
        trial_end: row.trialEnd,
        current_period_end: row.currentPeriodEnd,
        cancel_at_period_end: row.cancelAtPeriodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id' },
    );
    if (error) throw error;
  }

  async setPlan(
    playerId: string,
    plan: { tier: string; tierStatus: string; billingCycle?: BillingCycle },
  ): Promise<void> {
    const { error } = await this.client
      .from('players')
      .update({
        tier: plan.tier,
        tier_status: plan.tierStatus,
        ...(plan.billingCycle ? { billing_cycle: plan.billingCycle } : {}),
      })
      .eq('id', playerId);
    if (error) throw error;
  }

  async addEvent(playerId: string, kind: BillingEventKind, detail: Json): Promise<void> {
    const { error } = await this.client
      .from('billing_events')
      .insert({ player_id: playerId, kind, detail });
    if (error) throw error;
  }
}
