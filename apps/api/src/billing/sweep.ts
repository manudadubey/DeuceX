import {
  isLiveSubscriptionStatus,
  tierStatusForSubscription,
  type BillingActionsDb,
  type BillingStripeClient,
  type BillingSubscriptionRow,
} from '@deucex/actions/billing';
import {
  TRIAL_REMINDER_DAYS_BEFORE_END,
  isBillingCycle,
  isPaidPlan,
  planPriceLine,
  type BillingCycle,
  type PaidPlan,
} from '@deucex/shared';

// The hourly billing sweep (docs/BILLING-DECISIONS.md), idempotent so
// running every hour only means each change lands within the hour:
// - day 12: one reminder to add a card (decision 1), unless a card is on file;
// - day 14: a trial with no card lapses to Free with nothing deleted
//   (M-TIER-2). Paying patrons are paused first, automatically (owner
//   decision, 27 September 2026, the failed-payment rule extended to a
//   lapsed trial), and the plan only moves once none failed, so a Free
//   account never keeps charging anyone. A trial with a card becomes
//   whatever Stripe says: active once the first charge lands;
// - a paid plan cancelled for its period end drops to Free once Stripe has
//   ended it. Its patrons were already paused when the player confirmed.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TrialPlayer {
  id: string;
  name: string;
  tier: PaidPlan;
  billingCycle: BillingCycle;
  trialEndsAt: string;
  timezone: string;
}

export interface BillingNotice {
  title: string;
  body: string;
  href: string;
}

export interface BillingSweepStore {
  /** Trialing, not yet reminded, ending inside (now, until], with no live subscription. */
  listTrialsToRemind(now: Date, until: Date): Promise<TrialPlayer[]>;
  markReminded(playerId: string, at: Date): Promise<void>;
  /** Trialing players whose trial_ends_at has passed. */
  listEndedTrials(now: Date): Promise<TrialPlayer[]>;
  /** Live subscriptions set to cancel whose period has ended. */
  listDueCancellations(now: Date): Promise<BillingSubscriptionRow[]>;
  countPayingPatrons(playerId: string): Promise<number>;
  notify(playerId: string, notice: BillingNotice): Promise<void>;
}

export interface LapsePauseResult {
  changed: number;
  failed: string[];
  unnotified: string[];
}

export interface BillingSweepDeps {
  store: BillingSweepStore;
  billing: BillingActionsDb;
  stripe: BillingStripeClient | null;
  /** Pauses every paying patron for a lapse; null when Stripe isn't configured. */
  pausePatrons: ((playerId: string) => Promise<LapsePauseResult>) | null;
  now?: () => Date;
  logger?: { error(...args: unknown[]): void };
}

export interface BillingSweepResult {
  reminded: number;
  lapsed: number;
  converted: number;
  /** Lapses held back this hour (a patron pause failed, or Stripe isn't configured). */
  held: number;
  downgraded: number;
}

export function formatDay(iso: string, timezone: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  });
}

function planName(plan: PaidPlan): string {
  return plan === 'pro' ? 'Pro' : 'Elite';
}

export function trialReminderNotice(player: TrialPlayer): BillingNotice {
  const day = formatDay(player.trialEndsAt, player.timezone);
  const name = planName(player.tier);
  return {
    title: `Your ${name} trial ends on ${day}`,
    body:
      `Add a card to stay on ${name}: ${planPriceLine(player.tier, player.billingCycle)} from ${day}, ` +
      `charged by Stripe. Without a card you move to Free on ${day}; nothing is charged and nothing is deleted.`,
    href: '/settings?pane=billing',
  };
}

export function trialLapsedNotice(player: TrialPlayer, patronsPaused: number): BillingNotice {
  const name = planName(player.tier);
  const patrons =
    patronsPaused > 0
      ? ` Billing is paused for ${patronsPaused === 1 ? '1 patron' : `${patronsPaused} patrons`}, and each got an email from you; it resumes at the same price if you come back to ${name}.`
      : '';
  return {
    title: `Your ${name} trial has ended`,
    body:
      `You're on Free now. Nothing was charged, and your notes, ledger and patrons are all kept.${patrons}` +
      ` Add a card any time to go back to ${name}.`,
    href: '/settings?pane=billing',
  };
}

export function periodEndDowngradeNotice(plan: PaidPlan): BillingNotice {
  const name = planName(plan);
  return {
    title: `Your ${name} plan has ended`,
    body: `You're on Free now, as you asked. Nothing more is charged, and nothing is deleted. You can come back to ${name} from Settings any time.`,
    href: '/settings?pane=billing',
  };
}

async function lapseTrial(
  deps: BillingSweepDeps,
  player: TrialPlayer,
  logger: { error(...args: unknown[]): void },
): Promise<'lapsed' | 'held'> {
  let paused = 0;
  const paying = await deps.store.countPayingPatrons(player.id);
  if (paying > 0) {
    if (!deps.pausePatrons) {
      logger.error(
        `[billing-sweep] ${player.id}: trial ended with ${paying} paying patrons but Stripe isn't configured; held on the trial until it is.`,
      );
      return 'held';
    }
    const result = await deps.pausePatrons(player.id);
    if (result.failed.length > 0) {
      logger.error(
        `[billing-sweep] ${player.id}: Stripe couldn't pause ${result.failed.length} patrons; held on the trial, retrying next hour.`,
      );
      return 'held';
    }
    paused = result.changed;
    if (paused > 0) {
      await deps.billing.addEvent(player.id, 'patron_billing_auto_paused', {
        reason: 'trial_lapsed',
        patrons: paused,
        unnotified: result.unnotified.length,
      });
    }
  }
  await deps.billing.setPlan(player.id, { tier: 'free', tierStatus: 'free' });
  await deps.billing.addEvent(player.id, 'trial_lapsed', {
    plan: player.tier,
    patrons_paused: paused,
  });
  await deps.store.notify(player.id, trialLapsedNotice(player, paused));
  return 'lapsed';
}

export async function runBillingSweep(deps: BillingSweepDeps): Promise<BillingSweepResult> {
  const now = deps.now?.() ?? new Date();
  const logger = deps.logger ?? console;
  const result: BillingSweepResult = {
    reminded: 0,
    lapsed: 0,
    converted: 0,
    held: 0,
    downgraded: 0,
  };

  // Day 12.
  const remindUntil = new Date(now.getTime() + TRIAL_REMINDER_DAYS_BEFORE_END * DAY_MS);
  for (const player of await deps.store.listTrialsToRemind(now, remindUntil)) {
    await deps.store.notify(player.id, trialReminderNotice(player));
    await deps.store.markReminded(player.id, now);
    await deps.billing.addEvent(player.id, 'trial_reminder', { ends_at: player.trialEndsAt });
    result.reminded++;
  }

  // Day 14.
  for (const player of await deps.store.listEndedTrials(now)) {
    try {
      const sub = await deps.billing.getSubscription(player.id);
      if (sub && isLiveSubscriptionStatus(sub.status)) {
        if (!deps.stripe) {
          result.held++;
          continue;
        }
        const current = await deps.stripe.retrievePlanSubscription(sub.stripeSubscriptionId);
        await deps.billing.upsertSubscription({
          ...sub,
          status: current.status,
          trialEnd: current.trialEnd,
          currentPeriodEnd: current.currentPeriodEnd,
          cancelAtPeriodEnd: current.cancelAtPeriodEnd,
        });
        const tierStatus = tierStatusForSubscription(current.status);
        // Stripe's own trial can run a little past ours (Checkout's minimum lead).
        if (tierStatus === 'trialing') continue;
        if (tierStatus) {
          await deps.billing.setPlan(player.id, { tier: sub.plan, tierStatus });
          if (tierStatus === 'active') {
            await deps.billing.addEvent(player.id, 'subscription_active', {
              subscription: sub.stripeSubscriptionId,
            });
          }
          result.converted++;
          continue;
        }
      }
      const outcome = await lapseTrial(deps, player, logger);
      if (outcome === 'lapsed') result.lapsed++;
      else result.held++;
    } catch (err) {
      result.held++;
      logger.error(`[billing-sweep] ${player.id}: trial end failed:`, err);
    }
  }

  // Paid plans cancelled for their period end.
  if (deps.stripe) {
    for (const sub of await deps.store.listDueCancellations(now)) {
      try {
        const current = await deps.stripe.retrievePlanSubscription(sub.stripeSubscriptionId);
        await deps.billing.upsertSubscription({
          ...sub,
          status: current.status,
          currentPeriodEnd: current.currentPeriodEnd,
          cancelAtPeriodEnd: current.cancelAtPeriodEnd,
        });
        if (isLiveSubscriptionStatus(current.status)) continue;
        await deps.billing.setPlan(sub.playerId, { tier: 'free', tierStatus: 'free' });
        await deps.billing.addEvent(sub.playerId, 'downgraded', {
          at_period_end: true,
          subscription: sub.stripeSubscriptionId,
        });
        await deps.store.notify(sub.playerId, periodEndDowngradeNotice(sub.plan));
        result.downgraded++;
      } catch (err) {
        logger.error(`[billing-sweep] ${sub.playerId}: period-end downgrade failed:`, err);
      }
    }
  }

  return result;
}

/** Narrows a players row to a TrialPlayer, or null when it isn't a well-formed trial. */
export function toTrialPlayer(row: {
  id: string;
  name: string;
  tier: string | null;
  billing_cycle: string | null;
  trial_ends_at: string | null;
  timezone: string;
}): TrialPlayer | null {
  if (!isPaidPlan(row.tier) || !row.trial_ends_at) return null;
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    billingCycle: isBillingCycle(row.billing_cycle) ? row.billing_cycle : 'monthly',
    trialEndsAt: row.trial_ends_at,
    timezone: row.timezone,
  };
}
