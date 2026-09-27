import { describe, expect, it, vi } from 'vitest';
import type {
  BillingActionsDb,
  BillingStripeClient,
  BillingSubscriptionRow,
  PlanSubscriptionSummary,
} from '@deucex/actions/billing';
import {
  runBillingSweep,
  trialLapsedNotice,
  trialReminderNotice,
  type BillingNotice,
  type BillingSweepStore,
  type TrialPlayer,
} from './sweep';

const NOW = new Date('2026-10-11T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const trial: TrialPlayer = {
  id: 'player-1',
  name: 'Jannik Sinner',
  tier: 'pro',
  billingCycle: 'annual',
  trialEndsAt: new Date(NOW.getTime() - 60_000).toISOString(),
  timezone: 'Europe/Rome',
};

function world(opts: {
  toRemind?: TrialPlayer[];
  ended?: TrialPlayer[];
  due?: BillingSubscriptionRow[];
  sub?: BillingSubscriptionRow | null;
  payingPatrons?: number;
}) {
  const notices: Array<{ playerId: string; notice: BillingNotice }> = [];
  const events: Array<{ kind: string; detail: unknown }> = [];
  const plans: Array<{ tier: string; tierStatus: string }> = [];
  const reminded: string[] = [];
  let sub = opts.sub ?? null;
  const store: BillingSweepStore = {
    async listTrialsToRemind() {
      return opts.toRemind ?? [];
    },
    async markReminded(id) {
      reminded.push(id);
    },
    async listEndedTrials() {
      return opts.ended ?? [];
    },
    async listDueCancellations() {
      return opts.due ?? [];
    },
    async countPayingPatrons() {
      return opts.payingPatrons ?? 0;
    },
    async notify(playerId, notice) {
      notices.push({ playerId, notice });
    },
  };
  const billing: BillingActionsDb = {
    async getPlayer() {
      return null;
    },
    async setStripeCustomerId() {},
    async getSubscription() {
      return sub;
    },
    async upsertSubscription(row) {
      sub = row;
    },
    async setPlan(_id, plan) {
      plans.push({ tier: plan.tier, tierStatus: plan.tierStatus });
    },
    async addEvent(_id, kind, detail) {
      events.push({ kind, detail });
    },
  };
  return { store, billing, notices, events, plans, reminded, sub: () => sub };
}

function stripeReturning(summary: Partial<PlanSubscriptionSummary>): BillingStripeClient {
  return {
    createCustomer: vi.fn(),
    findPriceByLookupKey: vi.fn(),
    createPlanCheckoutSession: vi.fn(),
    retrievePlanCheckoutSession: vi.fn(),
    retrievePlanSubscription: vi.fn().mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      customerId: 'cus_1',
      priceLookupKey: 'deucex_pro_annual',
      trialEnd: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      metadata: {},
      ...summary,
    }),
    cancelPlanSubscription: vi.fn(),
  };
}

const liveRow: BillingSubscriptionRow = {
  playerId: 'player-1',
  stripeSubscriptionId: 'sub_1',
  stripeCustomerId: 'cus_1',
  plan: 'pro',
  billingCycle: 'annual',
  status: 'trialing',
  trialEnd: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

const silent = { error: vi.fn() };

describe('runBillingSweep: day 12', () => {
  it('reminds once, with the price, the date and what happens without a card', async () => {
    const endsAt = new Date(NOW.getTime() + 2 * DAY - 60_000).toISOString();
    const w = world({ toRemind: [{ ...trial, trialEndsAt: endsAt }] });
    const result = await runBillingSweep({
      store: w.store,
      billing: w.billing,
      stripe: null,
      pausePatrons: null,
      now: () => NOW,
    });
    expect(result.reminded).toBe(1);
    expect(w.reminded).toEqual(['player-1']);
    expect(w.notices[0]?.notice.title).toBe('Your Pro trial ends on 13 October');
    expect(w.notices[0]?.notice.body).toContain(
      'US$28 a month, billed yearly (US$336) from 13 October',
    );
    expect(w.notices[0]?.notice.body).toContain('nothing is charged and nothing is deleted');
    expect(w.events.map((e) => e.kind)).toEqual(['trial_reminder']);
  });
});

describe('runBillingSweep: day 14', () => {
  it('lapses a card-less trial to Free with no patrons to pause', async () => {
    const w = world({ ended: [trial] });
    const result = await runBillingSweep({
      store: w.store,
      billing: w.billing,
      stripe: null,
      pausePatrons: null,
      now: () => NOW,
    });
    expect(result.lapsed).toBe(1);
    expect(w.plans).toEqual([{ tier: 'free', tierStatus: 'free' }]);
    expect(w.events.map((e) => e.kind)).toEqual(['trial_lapsed']);
    expect(w.notices[0]?.notice.title).toBe('Your Pro trial has ended');
  });

  it('pauses paying patrons automatically before the plan moves, and says so', async () => {
    const pausePatrons = vi.fn().mockResolvedValue({ changed: 3, failed: [], unnotified: [] });
    const w = world({ ended: [trial], payingPatrons: 3 });
    await runBillingSweep({
      store: w.store,
      billing: w.billing,
      stripe: null,
      pausePatrons,
      now: () => NOW,
    });
    expect(pausePatrons).toHaveBeenCalledWith('player-1');
    expect(w.events.map((e) => e.kind)).toEqual(['patron_billing_auto_paused', 'trial_lapsed']);
    expect(w.plans).toEqual([{ tier: 'free', tierStatus: 'free' }]);
    expect(w.notices[0]?.notice.body).toContain('Billing is paused for 3 patrons');
  });

  it('holds the lapse when a patron pause fails, so a Free account never keeps charging', async () => {
    const pausePatrons = vi
      .fn()
      .mockResolvedValue({ changed: 1, failed: ['patron-2'], unnotified: [] });
    const w = world({ ended: [trial], payingPatrons: 2 });
    const result = await runBillingSweep({
      store: w.store,
      billing: w.billing,
      stripe: null,
      pausePatrons,
      now: () => NOW,
      logger: silent,
    });
    expect(result).toMatchObject({ lapsed: 0, held: 1 });
    expect(w.plans).toEqual([]);
    expect(w.notices).toEqual([]);
  });

  it('holds the lapse when there are paying patrons but no Stripe to pause them', async () => {
    const w = world({ ended: [trial], payingPatrons: 1 });
    const result = await runBillingSweep({
      store: w.store,
      billing: w.billing,
      stripe: null,
      pausePatrons: null,
      now: () => NOW,
      logger: silent,
    });
    expect(result.held).toBe(1);
    expect(w.plans).toEqual([]);
  });

  it('moves a trial with a card to active once Stripe has charged', async () => {
    const w = world({ ended: [trial], sub: liveRow });
    const result = await runBillingSweep({
      store: w.store,
      billing: w.billing,
      stripe: stripeReturning({ status: 'active' }),
      pausePatrons: null,
      now: () => NOW,
    });
    expect(result.converted).toBe(1);
    expect(w.plans).toEqual([{ tier: 'pro', tierStatus: 'active' }]);
    expect(w.sub()?.status).toBe('active');
    expect(w.events.map((e) => e.kind)).toEqual(['subscription_active']);
  });

  it("leaves a trial alone while Stripe's own trial is still running", async () => {
    const w = world({ ended: [trial], sub: liveRow });
    await runBillingSweep({
      store: w.store,
      billing: w.billing,
      stripe: stripeReturning({ status: 'trialing' }),
      pausePatrons: null,
      now: () => NOW,
    });
    expect(w.plans).toEqual([]);
  });
});

describe('runBillingSweep: period-end cancellations', () => {
  const due: BillingSubscriptionRow = {
    ...liveRow,
    status: 'active',
    cancelAtPeriodEnd: true,
    currentPeriodEnd: new Date(NOW.getTime() - 60_000).toISOString(),
  };

  it('drops to Free once Stripe has ended the subscription', async () => {
    const w = world({ due: [due] });
    const result = await runBillingSweep({
      store: w.store,
      billing: w.billing,
      stripe: stripeReturning({ status: 'canceled' }),
      pausePatrons: null,
      now: () => NOW,
    });
    expect(result.downgraded).toBe(1);
    expect(w.plans).toEqual([{ tier: 'free', tierStatus: 'free' }]);
    expect(w.notices[0]?.notice.title).toBe('Your Pro plan has ended');
  });

  it('waits while Stripe still has it live', async () => {
    const w = world({ due: [due] });
    await runBillingSweep({
      store: w.store,
      billing: w.billing,
      stripe: stripeReturning({ status: 'active', cancelAtPeriodEnd: true }),
      pausePatrons: null,
      now: () => NOW,
    });
    expect(w.plans).toEqual([]);
  });
});

describe('billing notices', () => {
  it('never uses an em dash', () => {
    const texts = [
      trialReminderNotice(trial),
      trialLapsedNotice(trial, 1),
      trialLapsedNotice(trial, 0),
    ];
    for (const n of texts) expect(`${n.title} ${n.body}`).not.toContain('—');
  });
});
