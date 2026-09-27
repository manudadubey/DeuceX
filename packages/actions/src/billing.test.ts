import { describe, expect, it, vi } from 'vitest';
import type { ApprovalGateDb, ApprovalRecord } from './gate';
import {
  AlreadySubscribedError,
  CHECKOUT_MIN_TRIAL_LEAD_MS,
  CheckoutNotYoursError,
  NoSubscriptionError,
  PlanChangeUnavailableError,
  PlanPriceMissingError,
  cancelPlan,
  checkoutTrialEnd,
  completeSubscriptionCheckout,
  startSubscriptionCheckout,
  tierStatusForSubscription,
  type BillingActionsDb,
  type BillingPlayer,
  type BillingSubscriptionRow,
} from './billing';
import {
  ApprovalAlreadyConsumedError,
  ApprovalNotFoundError,
  ApprovalPayloadMismatchError,
} from './errors';
import type { BillingStripeClient, PlanSubscriptionSummary } from './stripe-client';

function fakeGateDb(approvals: ApprovalRecord[]) {
  const byId = new Map(approvals.map((a) => [a.id, a]));
  const claimed = new Set<string>();
  const db: ApprovalGateDb = {
    async getApproval(approvalId, playerId) {
      const approval = byId.get(approvalId);
      return approval && approval.playerId === playerId ? approval : null;
    },
    async claimApproval({ approvalId }) {
      if (claimed.has(approvalId)) return false;
      claimed.add(approvalId);
      return true;
    },
  };
  return db;
}

const NOW = new Date('2026-10-01T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function trialPlayer(overrides: Partial<BillingPlayer> = {}): BillingPlayer {
  return {
    id: 'player-1',
    name: 'Jannik Sinner',
    email: 'jannik@example.com',
    tier: 'pro',
    tierStatus: 'trialing',
    billingCycle: 'annual',
    trialEndsAt: new Date(NOW.getTime() + 4 * DAY).toISOString(),
    stripeCustomerId: null,
    ...overrides,
  };
}

function fakeDb(player: BillingPlayer | null, sub: BillingSubscriptionRow | null = null) {
  const state = { player, sub, events: [] as Array<{ kind: string; detail: unknown }> };
  const db: BillingActionsDb = {
    async getPlayer() {
      return state.player;
    },
    async setStripeCustomerId(_id, customerId) {
      if (state.player) state.player = { ...state.player, stripeCustomerId: customerId };
    },
    async getSubscription() {
      return state.sub;
    },
    async upsertSubscription(row) {
      state.sub = row;
    },
    async setPlan(_id, plan) {
      if (state.player) {
        state.player = {
          ...state.player,
          tier: plan.tier,
          tierStatus: plan.tierStatus,
          billingCycle: plan.billingCycle ?? state.player.billingCycle,
        };
      }
    },
    async addEvent(_id, kind, detail) {
      state.events.push({ kind, detail });
    },
  };
  return { db, state };
}

function subSummary(overrides: Partial<PlanSubscriptionSummary> = {}): PlanSubscriptionSummary {
  return {
    id: 'sub_1',
    status: 'trialing',
    customerId: 'cus_1',
    priceLookupKey: 'deucex_pro_annual',
    trialEnd: new Date(NOW.getTime() + 4 * DAY).toISOString(),
    currentPeriodEnd: new Date(NOW.getTime() + 4 * DAY).toISOString(),
    cancelAtPeriodEnd: false,
    metadata: {},
    ...overrides,
  };
}

function fakeStripe(overrides: Partial<BillingStripeClient> = {}): BillingStripeClient {
  return {
    createCustomer: vi.fn().mockResolvedValue({ id: 'cus_1' }),
    findPriceByLookupKey: vi
      .fn()
      .mockResolvedValue({
        id: 'price_pro_annual',
        unitAmountMinor: 33600,
        currency: 'USD',
        interval: 'year',
      }),
    createPlanCheckoutSession: vi
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }),
    retrievePlanCheckoutSession: vi.fn(),
    retrievePlanSubscription: vi.fn().mockResolvedValue(subSummary()),
    cancelPlanSubscription: vi.fn(),
    ...overrides,
  };
}

const checkoutApproval: ApprovalRecord = {
  id: 'approval-1',
  playerId: 'player-1',
  actionType: 'subscription_checkout',
  payload: { plan: 'pro', cycle: 'annual' },
};

describe('checkoutTrialEnd', () => {
  it('keeps the trial end when it is far enough out', () => {
    expect(checkoutTrialEnd(trialPlayer(), NOW)).toBe(Math.ceil((NOW.getTime() + 4 * DAY) / 1000));
  });

  it("uses Stripe's minimum lead on day 13 rather than failing", () => {
    const player = trialPlayer({ trialEndsAt: new Date(NOW.getTime() + DAY).toISOString() });
    expect(checkoutTrialEnd(player, NOW)).toBe(
      Math.ceil((NOW.getTime() + CHECKOUT_MIN_TRIAL_LEAD_MS) / 1000),
    );
  });

  it('charges at once with no trial left', () => {
    expect(checkoutTrialEnd(trialPlayer({ tierStatus: 'free', tier: 'free' }), NOW)).toBeNull();
    expect(
      checkoutTrialEnd(
        trialPlayer({ trialEndsAt: new Date(NOW.getTime() - DAY).toISOString() }),
        NOW,
      ),
    ).toBeNull();
  });
});

describe('startSubscriptionCheckout', () => {
  it('refuses without an approval, and never reaches Stripe', async () => {
    const stripe = fakeStripe();
    const { db } = fakeDb(trialPlayer());
    await expect(
      startSubscriptionCheckout(fakeGateDb([]), db, stripe, {
        approvalId: 'approval-1',
        playerId: 'player-1',
        plan: 'pro',
        cycle: 'annual',
        appBaseUrl: 'http://localhost:3000',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ApprovalNotFoundError);
    expect(stripe.createCustomer).not.toHaveBeenCalled();
    expect(stripe.createPlanCheckoutSession).not.toHaveBeenCalled();
  });

  it('refuses a plan other than the one approved', async () => {
    const stripe = fakeStripe();
    const { db } = fakeDb(trialPlayer());
    await expect(
      startSubscriptionCheckout(fakeGateDb([checkoutApproval]), db, stripe, {
        approvalId: 'approval-1',
        playerId: 'player-1',
        plan: 'elite',
        cycle: 'annual',
        appBaseUrl: 'http://localhost:3000',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ApprovalPayloadMismatchError);
    expect(stripe.createPlanCheckoutSession).not.toHaveBeenCalled();
  });

  it('creates the customer once, prices by lookup key and dates the first charge to the trial end', async () => {
    const stripe = fakeStripe();
    const { db, state } = fakeDb(trialPlayer());
    const result = await startSubscriptionCheckout(fakeGateDb([checkoutApproval]), db, stripe, {
      approvalId: 'approval-1',
      playerId: 'player-1',
      plan: 'pro',
      cycle: 'annual',
      appBaseUrl: 'http://localhost:3000',
      now: NOW,
    });
    expect(result.url).toBe('https://checkout.stripe.test/cs_1');
    expect(stripe.findPriceByLookupKey).toHaveBeenCalledWith('deucex_pro_annual');
    expect(state.player?.stripeCustomerId).toBe('cus_1');
    expect(stripe.createPlanCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_1',
        priceId: 'price_pro_annual',
        trialEnd: Math.ceil((NOW.getTime() + 4 * DAY) / 1000),
        successUrl: 'http://localhost:3000/settings?pane=billing&checkout={CHECKOUT_SESSION_ID}',
        metadata: { deucex_player_id: 'player-1', plan: 'pro', cycle: 'annual' },
      }),
    );
  });

  it('reuses an existing customer', async () => {
    const stripe = fakeStripe();
    const { db } = fakeDb(trialPlayer({ stripeCustomerId: 'cus_existing' }));
    await startSubscriptionCheckout(fakeGateDb([checkoutApproval]), db, stripe, {
      approvalId: 'approval-1',
      playerId: 'player-1',
      plan: 'pro',
      cycle: 'annual',
      appBaseUrl: 'http://localhost:3000',
      now: NOW,
    });
    expect(stripe.createCustomer).not.toHaveBeenCalled();
    expect(stripe.createPlanCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cus_existing' }),
    );
  });

  it('refuses a second paid plan, a comp and a missing price', async () => {
    const live: BillingSubscriptionRow = {
      playerId: 'player-1',
      stripeSubscriptionId: 'sub_1',
      stripeCustomerId: 'cus_1',
      plan: 'pro',
      billingCycle: 'annual',
      status: 'active',
      trialEnd: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
    const input = {
      approvalId: 'approval-1',
      playerId: 'player-1',
      plan: 'pro' as const,
      cycle: 'annual' as const,
      appBaseUrl: 'http://localhost:3000',
      now: NOW,
    };
    await expect(
      startSubscriptionCheckout(
        fakeGateDb([checkoutApproval]),
        fakeDb(trialPlayer(), live).db,
        fakeStripe(),
        input,
      ),
    ).rejects.toBeInstanceOf(AlreadySubscribedError);
    await expect(
      startSubscriptionCheckout(
        fakeGateDb([checkoutApproval]),
        fakeDb(trialPlayer({ tierStatus: 'comped' })).db,
        fakeStripe(),
        input,
      ),
    ).rejects.toBeInstanceOf(PlanChangeUnavailableError);
    await expect(
      startSubscriptionCheckout(
        fakeGateDb([checkoutApproval]),
        fakeDb(trialPlayer()).db,
        fakeStripe({ findPriceByLookupKey: vi.fn().mockResolvedValue(null) }),
        input,
      ),
    ).rejects.toBeInstanceOf(PlanPriceMissingError);
  });

  it('never runs twice on one approval', async () => {
    const gate = fakeGateDb([checkoutApproval]);
    const input = {
      approvalId: 'approval-1',
      playerId: 'player-1',
      plan: 'pro' as const,
      cycle: 'annual' as const,
      appBaseUrl: 'http://localhost:3000',
      now: NOW,
    };
    await startSubscriptionCheckout(gate, fakeDb(trialPlayer()).db, fakeStripe(), input);
    await expect(
      startSubscriptionCheckout(gate, fakeDb(trialPlayer()).db, fakeStripe(), input),
    ).rejects.toBeInstanceOf(ApprovalAlreadyConsumedError);
  });
});

describe('completeSubscriptionCheckout', () => {
  const completeSession = {
    id: 'cs_1',
    status: 'complete' as const,
    subscriptionId: 'sub_1',
    customerId: 'cus_1',
    metadata: { deucex_player_id: 'player-1', plan: 'pro', cycle: 'annual' },
  };

  it('records the subscription, keeps a trial as trialing, and is idempotent', async () => {
    const stripe = fakeStripe({
      retrievePlanCheckoutSession: vi.fn().mockResolvedValue(completeSession),
    });
    const { db, state } = fakeDb(trialPlayer());
    const first = await completeSubscriptionCheckout(db, stripe, {
      playerId: 'player-1',
      sessionId: 'cs_1',
    });
    expect(first).toMatchObject({
      state: 'complete',
      plan: 'pro',
      cycle: 'annual',
      tierStatus: 'trialing',
    });
    expect(state.sub).toMatchObject({
      stripeSubscriptionId: 'sub_1',
      status: 'trialing',
      plan: 'pro',
    });
    await completeSubscriptionCheckout(db, stripe, { playerId: 'player-1', sessionId: 'cs_1' });
    expect(state.events.filter((e) => e.kind === 'checkout_completed')).toHaveLength(1);
  });

  it("moves a Free player straight onto the plan when there's no trial left", async () => {
    const stripe = fakeStripe({
      retrievePlanCheckoutSession: vi.fn().mockResolvedValue(completeSession),
      retrievePlanSubscription: vi
        .fn()
        .mockResolvedValue(subSummary({ status: 'active', trialEnd: null })),
    });
    const { db, state } = fakeDb(trialPlayer({ tier: 'free', tierStatus: 'free' }));
    await completeSubscriptionCheckout(db, stripe, { playerId: 'player-1', sessionId: 'cs_1' });
    expect(state.player).toMatchObject({
      tier: 'pro',
      tierStatus: 'active',
      billingCycle: 'annual',
    });
  });

  it("refuses someone else's checkout and leaves an open one alone", async () => {
    const others = fakeStripe({
      retrievePlanCheckoutSession: vi
        .fn()
        .mockResolvedValue({
          ...completeSession,
          metadata: { ...completeSession.metadata, deucex_player_id: 'player-2' },
        }),
    });
    await expect(
      completeSubscriptionCheckout(fakeDb(trialPlayer()).db, others, {
        playerId: 'player-1',
        sessionId: 'cs_1',
      }),
    ).rejects.toBeInstanceOf(CheckoutNotYoursError);

    const open = fakeStripe({
      retrievePlanCheckoutSession: vi
        .fn()
        .mockResolvedValue({ ...completeSession, status: 'open', subscriptionId: null }),
    });
    const { db, state } = fakeDb(trialPlayer());
    expect(
      await completeSubscriptionCheckout(db, open, { playerId: 'player-1', sessionId: 'cs_1' }),
    ).toEqual({
      state: 'open',
    });
    expect(state.sub).toBeNull();
  });
});

describe('cancelPlan', () => {
  const cancelApproval: ApprovalRecord = {
    id: 'approval-2',
    playerId: 'player-1',
    actionType: 'subscription_cancel',
    payload: {},
  };
  const row: BillingSubscriptionRow = {
    playerId: 'player-1',
    stripeSubscriptionId: 'sub_1',
    stripeCustomerId: 'cus_1',
    plan: 'pro',
    billingCycle: 'monthly',
    status: 'trialing',
    trialEnd: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };

  it('refuses without an approval, and never reaches Stripe', async () => {
    const stripe = fakeStripe();
    await expect(
      cancelPlan(fakeGateDb([]), fakeDb(trialPlayer(), row).db, stripe, {
        approvalId: 'approval-2',
        playerId: 'player-1',
      }),
    ).rejects.toBeInstanceOf(ApprovalNotFoundError);
    expect(stripe.cancelPlanSubscription).not.toHaveBeenCalled();
  });

  it('ends a card-backed trial now: nothing has been charged', async () => {
    const stripe = fakeStripe({
      cancelPlanSubscription: vi.fn().mockResolvedValue(subSummary({ status: 'canceled' })),
    });
    const { db, state } = fakeDb(trialPlayer(), row);
    const result = await cancelPlan(fakeGateDb([cancelApproval]), db, stripe, {
      approvalId: 'approval-2',
      playerId: 'player-1',
    });
    expect(result.effective).toBe('now');
    expect(stripe.cancelPlanSubscription).toHaveBeenCalledWith({
      subscriptionId: 'sub_1',
      atPeriodEnd: false,
    });
    expect(state.player).toMatchObject({ tier: 'free', tierStatus: 'free' });
  });

  it('lets a paid period run out, leaving the plan in place until then', async () => {
    const periodEnd = new Date(NOW.getTime() + 20 * DAY).toISOString();
    const stripe = fakeStripe({
      retrievePlanSubscription: vi.fn().mockResolvedValue(subSummary({ status: 'active' })),
      cancelPlanSubscription: vi
        .fn()
        .mockResolvedValue(
          subSummary({ status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd }),
        ),
    });
    const { db, state } = fakeDb(trialPlayer({ tierStatus: 'active' }), {
      ...row,
      status: 'active',
    });
    const result = await cancelPlan(fakeGateDb([cancelApproval]), db, stripe, {
      approvalId: 'approval-2',
      playerId: 'player-1',
    });
    expect(result).toEqual({ effective: 'period_end', effectiveAt: periodEnd });
    expect(stripe.cancelPlanSubscription).toHaveBeenCalledWith({
      subscriptionId: 'sub_1',
      atPeriodEnd: true,
    });
    expect(state.player).toMatchObject({ tier: 'pro', tierStatus: 'active' });
    expect(state.sub?.cancelAtPeriodEnd).toBe(true);
  });

  it('refuses when there is no live plan', async () => {
    await expect(
      cancelPlan(fakeGateDb([cancelApproval]), fakeDb(trialPlayer()).db, fakeStripe(), {
        approvalId: 'approval-2',
        playerId: 'player-1',
      }),
    ).rejects.toBeInstanceOf(NoSubscriptionError);
  });
});

describe('tierStatusForSubscription', () => {
  it('maps Stripe statuses onto players.tier_status', () => {
    expect(tierStatusForSubscription('trialing')).toBe('trialing');
    expect(tierStatusForSubscription('active')).toBe('active');
    expect(tierStatusForSubscription('past_due')).toBe('past_due');
    expect(tierStatusForSubscription('canceled')).toBeNull();
  });
});
