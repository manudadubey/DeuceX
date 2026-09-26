import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunsDb } from '@deucex/actions';
import type {
  FansStripeClient,
  StripeWebhookEvent,
  SubscriptionSummary,
} from '@deucex/actions/fans';
import { createMockPatronNoteClient, type PatronNoteModelClient } from '@deucex/agents';
import { MemoryFansStore } from './memory-store';
import {
  QUIET_NOTE,
  applyJoinFromSession,
  applyStripeEvent,
  draftPatronNote,
  joinWaitlist,
  loadPublicPage,
  runAttentionPass,
  runPausedExpirySweep,
  PAUSED_EXPIRY_ENDED_REASON,
  thanksLine,
} from './service';
import type { StoredPatron } from './store';

const NOW = new Date('2026-09-12T08:00:00Z');
const PLAYER_ID = 'player-1';
const ACCOUNT = 'acct_arya';

function seed(store: MemoryFansStore) {
  store.players.set(PLAYER_ID, {
    id: PLAYER_ID,
    name: 'Arya Dubey',
    tier: 'pro',
    timezone: 'Australia/Sydney',
    dob: '2001-03-04',
  });
  store.programmes.set(PLAYER_ID, {
    playerId: PLAYER_ID,
    slug: 'arya-dubey',
    stripeAccountId: ACCOUNT,
    kycStatus: 'complete',
    chargesEnabled: true,
    namesLineEnabled: true,
  });
  store.tiers.push(
    {
      id: 't1',
      playerId: PLAYER_ID,
      position: 1,
      name: 'Courtside',
      price: 29,
      currency: 'AUD',
      perks: 'Every update.',
      stripeProductId: 'prod_1',
      stripePriceId: 'price_1',
    },
    {
      id: 't2',
      playerId: PLAYER_ID,
      position: 2,
      name: 'Locker Room',
      price: 65,
      currency: 'AUD',
      perks: 'Practice notes.',
      stripeProductId: 'prod_2',
      stripePriceId: 'price_2',
    },
    {
      id: 't3',
      playerId: PLAYER_ID,
      position: 3,
      name: 'Inside Track',
      price: 185,
      currency: 'AUD',
      perks: 'A call after each event.',
      stripeProductId: 'prod_3',
      stripePriceId: 'price_3',
    },
  );
}

function patron(overrides: Partial<StoredPatron> & { id: string; name: string }): StoredPatron {
  return {
    playerId: PLAYER_ID,
    tierId: 't1',
    stripeSubscriptionId: `sub_${overrides.id}`,
    email: `${overrides.id}@example.com`,
    status: 'active',
    since: '2025-06-10T09:00:00Z',
    leftAt: null,
    leftReason: null,
    price: 29,
    currency: 'AUD',
    opens: [],
    flag: 'none',
    note: null,
    namesOptIn: false,
    cardFailedAt: null,
    cardRetryAt: null,
    pausedAt: null,
    source: 'unknown',
    ...overrides,
  };
}

function subscription(overrides: Partial<SubscriptionSummary> = {}): SubscriptionSummary {
  return {
    id: 'sub_mira',
    status: 'active',
    customerId: 'cus_mira',
    priceId: 'price_1',
    productId: 'prod_1',
    unitAmountMinor: 2900,
    currency: 'AUD',
    metadata: {},
    cancellationComment: null,
    cancellationFeedback: null,
    endedAt: null,
    canceledAt: null,
    paused: false,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

function fakeStripe(overrides: Partial<FansStripeClient> = {}): FansStripeClient {
  return {
    async createExpressAccount() {
      throw new Error('unused');
    },
    async createAccountLink() {
      throw new Error('unused');
    },
    async retrieveAccount() {
      return {
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        requirementsDue: false,
        bankLast4: '4821',
      };
    },
    async upsertTierPrice() {
      throw new Error('unused');
    },
    async createCheckoutSession() {
      throw new Error('unused');
    },
    async retrieveCheckoutSession({ id }) {
      return {
        id,
        status: 'complete',
        subscriptionId: 'sub_mira',
        customerId: 'cus_mira',
        name: 'Mira Kovac',
        email: 'mira@example.com',
        city: 'Graz',
        country: 'AT',
        metadata: {
          procircuit_player_id: PLAYER_ID,
          procircuit_tier_id: 't1',
          source: 'draw',
          names_opt_in: 'true',
        },
        createdAt: '2026-09-05T05:41:00Z',
      };
    },
    async retrieveSubscription() {
      return subscription();
    },
    async listPayoutBalanceLines() {
      return [];
    },
    verifyWebhook() {
      throw new Error('unused');
    },
    async createPortalSession() {
      throw new Error('unused');
    },
    async setSubscriptionPaused() {
      throw new Error('unused');
    },
    async retrievePlatformBalance() {
      return [];
    },
    async cancelSubscription() {
      throw new Error('unused');
    },
    ...overrides,
  };
}

function event(
  type: string,
  object: Record<string, unknown>,
  id = `evt_${type}`,
): StripeWebhookEvent {
  return {
    id,
    type,
    account: ACCOUNT,
    createdAt: NOW.toISOString(),
    object,
    previousAttributes: null,
  };
}

let store: MemoryFansStore;
beforeEach(() => {
  store = new MemoryFansStore();
  seed(store);
});

describe('a new patron (P-6, P-AC-6)', () => {
  it('records Mira with her draw-page source, one join event and one FYI', async () => {
    const deps = { store, stripe: fakeStripe(), now: () => NOW };
    const outcome = await applyStripeEvent(
      deps,
      event('checkout.session.completed', { id: 'cs_1', mode: 'subscription' }),
    );
    expect(outcome).toBe('applied');
    expect(store.patrons).toHaveLength(1);
    expect(store.patrons[0]).toMatchObject({
      name: 'Mira Kovac',
      tierId: 't1',
      source: 'draw',
      flag: 'new',
      price: 29,
      namesOptIn: true,
    });
    expect(store.events).toEqual([
      expect.objectContaining({ kind: 'join', attribution: 'found you via a draw page link' }),
    ]);
    expect(store.notifications).toEqual([
      expect.objectContaining({
        category: 'fyi',
        title: 'Mira K. joined Courtside',
        body: 'Found you via a draw page link. 1 patron now.',
      }),
    ]);
  });

  it('is idempotent across a re-delivered webhook and the thank-you page reconcile', async () => {
    const deps = { store, stripe: fakeStripe(), now: () => NOW };
    const e = event('checkout.session.completed', { id: 'cs_1', mode: 'subscription' });
    await applyStripeEvent(deps, e);
    expect(await applyStripeEvent(deps, e)).toBe('duplicate');
    const session = await deps.stripe.retrieveCheckoutSession({ account: ACCOUNT, id: 'cs_1' });
    const again = await applyJoinFromSession(
      deps,
      (await store.getProgramme(PLAYER_ID))!,
      session,
      null,
    );
    expect(again?.inserted).toBe(false);
    expect(store.patrons).toHaveLength(1);
    expect(store.events).toHaveLength(1);
    expect(store.notifications).toHaveLength(1);
  });

  it('attributes the join to an update sent within seven days', async () => {
    store.updates.push({ id: 'u1', title: 'Clay block, week two', sentAt: '2026-09-03T05:41:00Z' });
    await applyStripeEvent(
      { store, stripe: fakeStripe(), now: () => NOW },
      event('checkout.session.completed', { id: 'cs_1', mode: 'subscription' }),
    );
    expect(store.events[0]!.attribution).toBe(
      '48 hours after "Clay block, week two" · found you via a draw page link',
    );
  });

  it('runs a delivery again when its first apply threw', async () => {
    const failing = fakeStripe({
      async retrieveSubscription() {
        throw new Error('Stripe down');
      },
    });
    const e = event('checkout.session.completed', { id: 'cs_1', mode: 'subscription' });
    await expect(applyStripeEvent({ store, stripe: failing, now: () => NOW }, e)).rejects.toThrow(
      'Stripe down',
    );
    expect(await applyStripeEvent({ store, stripe: fakeStripe(), now: () => NOW }, e)).toBe(
      'applied',
    );
    expect(store.patrons).toHaveLength(1);
  });

  it('ignores events from an account that is not a DeuceX patron programme', async () => {
    const e = {
      ...event('checkout.session.completed', { id: 'cs_1', mode: 'subscription' }),
      account: 'acct_other',
    };
    expect(await applyStripeEvent({ store, stripe: fakeStripe() }, e)).toBe('ignored');
  });
});

describe('a failed card (P-AC-8)', () => {
  it('marks Tom past due with the card badge, the retry day and one For-you notification', async () => {
    store.patrons.push(patron({ id: 'tom', name: 'Tom Brandt' }));
    await applyStripeEvent(
      { store, stripe: fakeStripe(), now: () => NOW },
      event('invoice.payment_failed', {
        parent: { subscription_details: { subscription: 'sub_tom' } },
        next_payment_attempt: Date.parse('2026-09-18T06:00:00Z') / 1000,
      }),
    );
    expect(store.patrons[0]).toMatchObject({ status: 'past_due', flag: 'card' });
    expect(store.patrons[0]!.note).toBe('Card payment failed on 12 Sept · Stripe retries Fri');
    expect(store.notifications).toEqual([
      expect.objectContaining({
        category: 'for_you',
        title: "Tom B.'s card payment failed",
        body: 'Stripe retries Friday. A gentle nudge is drafted if you want it.',
      }),
    ]);
  });

  it('clears the flag when the retry succeeds', async () => {
    store.patrons.push(
      patron({
        id: 'tom',
        name: 'Tom Brandt',
        status: 'past_due',
        flag: 'card',
        cardFailedAt: '2026-09-10T00:00:00Z',
      }),
    );
    await applyStripeEvent(
      { store, stripe: fakeStripe(), now: () => NOW },
      event('invoice.paid', { subscription: 'sub_tom' }),
    );
    expect(store.patrons[0]).toMatchObject({ status: 'active', flag: 'none', cardFailedAt: null });
    expect(store.events.map((e) => e.kind)).toEqual(['card_recovered']);
  });
});

describe('a departure (P-AC-7)', () => {
  it("keeps Anna's record as left with no reason, and says so", async () => {
    store.patrons.push(
      patron({
        id: 'anna',
        name: 'Anna Pichler',
        tierId: 't2',
        price: 65,
        since: '2025-06-25T09:00:00Z',
      }),
    );
    const stripe = fakeStripe({
      async retrieveSubscription() {
        return subscription({
          id: 'sub_anna',
          status: 'canceled',
          endedAt: '2026-08-25T10:00:00Z',
        });
      },
    });
    await applyStripeEvent(
      { store, stripe, now: () => NOW },
      event('customer.subscription.deleted', { id: 'sub_anna' }),
    );
    expect(store.patrons[0]).toMatchObject({
      status: 'left',
      leftAt: '2026-08-25T10:00:00Z',
      leftReason: null,
    });
    expect(store.events[0]).toMatchObject({
      kind: 'leave',
      attribution: '14 months. No reason given.',
    });
    expect(store.notifications[0]).toMatchObject({
      title: 'Anna P. left Locker Room',
      body: '14 months. A thank-you note is still worth sending.',
    });
  });
});

describe('a tier change through the Stripe portal (P-17)', () => {
  it('records Chris moving up to Locker Room at the new price', async () => {
    store.patrons.push(patron({ id: 'chris', name: 'Chris Obi' }));
    const stripe = fakeStripe({
      async retrieveSubscription() {
        return subscription({
          id: 'sub_chris',
          productId: 'prod_2',
          priceId: 'price_2',
          unitAmountMinor: 6500,
        });
      },
    });
    await applyStripeEvent(
      { store, stripe, now: () => NOW },
      event('customer.subscription.updated', { id: 'sub_chris' }),
    );
    expect(store.patrons[0]).toMatchObject({ tierId: 't2', price: 65 });
    expect(store.events[0]).toMatchObject({ kind: 'upgrade', fromTierId: 't1', toTierId: 't2' });
    expect(store.notifications[0]!.title).toBe('Chris O. moved up to Locker Room');
  });
});

describe('payouts (P-13, P-AC-2, P-AC-3)', () => {
  const charges = [...Array<number>(8).fill(2900), ...Array<number>(3).fill(6500), 18500];
  const lines = charges.map((amount) => ({
    type: 'charge',
    amountMinor: amount,
    feeDetails: [
      { type: 'application_fee', amountMinor: Math.round(amount * 0.08) },
      { type: 'stripe_fee', amountMinor: Math.round(amount * 0.0175 + 30) },
    ],
  }));
  const stripe = fakeStripe({ listPayoutBalanceLines: async () => lines });
  const payout = (status: string) => ({
    id: 'po_1',
    status,
    currency: 'aud',
    created: Date.parse('2026-09-18T22:00:00Z') / 1000,
    arrival_date: Date.parse('2026-09-21T00:00:00Z') / 1000,
  });

  it('stores gross A$612, fee A$48.96, Stripe A$14.34, net A$548.70 as Scheduled, then Paid with one FYI', async () => {
    await applyStripeEvent(
      { store, stripe, now: () => NOW },
      event('payout.created', payout('pending'), 'evt_1'),
    );
    expect(store.payouts.get('po_1')).toMatchObject({
      gross: 612,
      platformFee: 48.96,
      platformFeeRate: 0.08,
      stripeFee: 14.34,
      net: 548.7,
      status: 'scheduled',
      friday: '2026-09-18',
    });
    expect(store.notifications).toHaveLength(0);

    await applyStripeEvent(
      { store, stripe, now: () => NOW },
      event('payout.paid', payout('paid'), 'evt_2'),
    );
    expect(store.payouts.get('po_1')).toMatchObject({
      status: 'paid',
      paidAt: '2026-09-21T00:00:00.000Z',
    });
    expect(store.notifications).toEqual([
      expect.objectContaining({
        title: 'Payout sent · A$549',
        body: 'A$612 gross, minus the 8% platform fee (A$49) and Stripe (A$14).',
      }),
    ]);
  });

  it('never rewrites a paid payout (M-GATE-3)', async () => {
    await applyStripeEvent(
      { store, stripe, now: () => NOW },
      event('payout.paid', payout('paid'), 'evt_1'),
    );
    await applyStripeEvent(
      { store, stripe, now: () => NOW },
      event('payout.updated', payout('failed'), 'evt_2'),
    );
    expect(store.payouts.get('po_1')!.status).toBe('paid');
  });
});

describe('the 06:00 attention pass (P-9, P-AC-4)', () => {
  it('flags Sophie quiet with her note, keeps Tom on card, and leaves the rest alone', async () => {
    store.patrons.push(
      patron({ id: 'sophie', name: 'Sophie Taler', opens: [1, 1, 1, 0, 0, 0] }),
      patron({
        id: 'tom',
        name: 'Tom Brandt',
        status: 'past_due',
        cardFailedAt: '2026-09-10T00:00:00Z',
        flag: 'card',
      }),
      patron({ id: 'gerhard', name: 'Gerhard Berger', opens: [1, 1, 1, 1, 1, 1] }),
    );
    await runAttentionPass({ store, now: () => NOW }, PLAYER_ID);
    const byId = Object.fromEntries(store.patrons.map((p) => [p.id, p]));
    expect(byId.sophie).toMatchObject({ flag: 'quiet', note: QUIET_NOTE });
    expect(byId.tom!.flag).toBe('card');
    expect(byId.gerhard).toMatchObject({ flag: 'none', note: null });
  });
});

describe('the public patron page (P-2, P-3, P-19, M-TIER-3)', () => {
  it('sells the three tiers while there is room, with the opted-in thanks line', async () => {
    store.patrons.push(
      patron({ id: 'mira', name: 'Mira Kovac', namesOptIn: true }),
      patron({ id: 'daniel', name: 'Daniel Reiter', namesOptIn: true }),
      patron({ id: 'x', name: 'Private Person' }),
    );
    const page = await loadPublicPage({ store, now: () => NOW }, 'arya-dubey');
    expect(page).toMatchObject({
      state: 'open',
      playerName: 'Arya Dubey',
      thanksLine: 'Thanks to Mira, Daniel and 1 more.',
    });
    expect(page!.tiers.map((t) => t.name)).toEqual(['Courtside', 'Locker Room', 'Inside Track']);
    expect(JSON.stringify(page)).not.toContain('Kovac');
    expect(JSON.stringify(page)).not.toContain('example.com');
  });

  it('P-AC-14: builds "Thanks to Mira, Daniel, Chris, Jonas and 8 more."', () => {
    const named = ['Mira K', 'Daniel R', 'Chris O', 'Jonas W'].map((n, i) =>
      patron({ id: `n${i}`, name: n, namesOptIn: true }),
    );
    const others = Array.from({ length: 8 }, (_, i) => patron({ id: `o${i}`, name: `Other ${i}` }));
    expect(thanksLine([...named, ...others])).toBe(
      'Thanks to Mira, Daniel, Chris, Jonas and 8 more.',
    );
  });

  it('hides every name when the Patron names switch is off', async () => {
    store.programmes.get(PLAYER_ID)!.namesLineEnabled = false;
    store.patrons.push(patron({ id: 'mira', name: 'Mira Kovac', namesOptIn: true }));
    expect((await loadPublicPage({ store, now: () => NOW }, 'arya-dubey'))!.thanksLine).toBeNull();
  });

  it('P-AC-9: at 50 active patrons on Pro the page offers the waitlist', async () => {
    for (let i = 0; i < 50; i++) store.patrons.push(patron({ id: `p${i}`, name: `Patron ${i}` }));
    expect((await loadPublicPage({ store, now: () => NOW }, 'arya-dubey'))!.state).toBe('full');
  });

  it('shows no tiers on Free, before KYC, or for an under-18 player (M-ID-3)', async () => {
    store.players.get(PLAYER_ID)!.tier = 'free';
    expect(await loadPublicPage({ store, now: () => NOW }, 'arya-dubey')).toMatchObject({
      state: 'closed',
      tiers: [],
    });
    store.players.get(PLAYER_ID)!.tier = 'pro';
    store.players.get(PLAYER_ID)!.dob = '2010-01-01';
    expect((await loadPublicPage({ store, now: () => NOW }, 'arya-dubey'))!.state).toBe('closed');
    store.players.get(PLAYER_ID)!.dob = '2001-01-01';
    store.programmes.get(PLAYER_ID)!.kycStatus = 'pending';
    expect((await loadPublicPage({ store, now: () => NOW }, 'arya-dubey'))!.state).toBe('closed');
  });

  it('adds to the waitlist without an error for a repeat email, and tells the player once', async () => {
    await joinWaitlist({ store }, 'arya-dubey', 'Fan@Example.com');
    await joinWaitlist({ store }, 'arya-dubey', 'fan@example.com');
    await joinWaitlist({ store }, 'arya-dubey', 'second@example.com');
    expect(store.waitlist).toHaveLength(2);
    expect(store.notifications).toEqual([
      expect.objectContaining({
        category: 'for_you',
        title: 'Your page is full · 1 on the waitlist',
      }),
    ]);
  });
});

describe('drafting a note on tap (P-10, P-AC-5)', () => {
  const agentRuns: AgentRunsDb = { insertAgentRun: vi.fn(async () => undefined) };

  it("drafts Anna's thank-you once, records the run, and serves the cache next time", async () => {
    store.patrons.push(
      patron({
        id: 'anna',
        name: 'Anna Pichler',
        status: 'left',
        leftAt: '2026-08-25T10:00:00Z',
        tierId: 't2',
      }),
      patron({ id: 'mira', name: 'Mira Kovac' }),
    );
    const client = createMockPatronNoteClient();
    const spy = vi.spyOn(client, 'complete');
    const deps = { store, noteClient: client, agentRuns, now: () => NOW };
    const first = await draftPatronNote(deps, PLAYER_ID, 'anna');
    expect(first).toMatchObject({ kind: 'thanks' });
    expect(first!.text!.startsWith('Anna, I noticed you moved on last month')).toBe(true);
    const cached = await draftPatronNote(deps, PLAYER_ID, 'anna');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(agentRuns.insertAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'fans/patron-note', status: 'succeeded' }),
    );
    // PRD-13 AD-13: the send approval links the drafting run, cached or not.
    const written = vi.mocked(agentRuns.insertAgentRun).mock.calls.at(-1)![0];
    expect(first!.runId).toBe(written.id);
    expect(cached!.runId).toBe(written.id);
  });

  it('returns no text when the agent could not draft one, so the player writes it', async () => {
    store.patrons.push(patron({ id: 'tom', name: 'Tom Brandt' }));
    const broken: PatronNoteModelClient = {
      async complete() {
        return { raw: { text: 'nope' }, usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };
    const result = await draftPatronNote(
      { store, noteClient: broken, agentRuns, now: () => NOW },
      PLAYER_ID,
      'tom',
    );
    expect(result).toEqual({ kind: 'checkin', text: null, runId: null });
  });
});

describe('step 4.1b · webhook sync for the portal and the pause', () => {
  it('marks a patron paused when Stripe reports paused billing, and active again on resume', async () => {
    store.patrons.push(
      patron({ id: 'mira', name: 'Mira Kovac', stripeSubscriptionId: 'sub_mira' }),
    );
    let paused = true;
    const stripe = fakeStripe({
      async retrieveSubscription() {
        return subscription({ paused });
      },
    });
    await applyStripeEvent(
      { store, stripe, now: () => NOW },
      event('customer.subscription.updated', { id: 'sub_mira' }, 'evt_a'),
    );
    expect(store.patrons[0]!.status).toBe('paused');
    paused = false;
    await applyStripeEvent(
      { store, stripe, now: () => NOW },
      event('customer.subscription.updated', { id: 'sub_mira' }, 'evt_b'),
    );
    expect(store.patrons[0]!.status).toBe('active');
  });

  it('records the reason a patron picked in the portal when they leave no comment (P-17)', async () => {
    store.patrons.push(patron({ id: 'anna', name: 'Anna Pichler', since: '2025-06-25T09:00:00Z' }));
    const stripe = fakeStripe({
      async retrieveSubscription() {
        return subscription({
          id: 'sub_anna',
          endedAt: '2026-08-25T10:00:00Z',
          cancellationFeedback: 'too_expensive',
        });
      },
    });
    await applyStripeEvent(
      { store, stripe, now: () => NOW },
      event('customer.subscription.deleted', { id: 'sub_anna' }),
    );
    expect(store.patrons[0]!.leftReason).toBe('Too expensive');
    expect(store.events[0]!.attribution).toBe('14 months. "Too expensive"');
  });
});

describe('step 4.1b follow-up · the 90-day paused-membership sweep', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const pausedDaysAgo = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();

  function sweepDeps(overrides: Partial<FansStripeClient> = {}) {
    const cancelled: string[] = [];
    const sent: Array<{ to: string; subject: string }> = [];
    const stripe = fakeStripe({
      async retrievePlatformBalance() {
        return [];
      },
      async cancelSubscription({ subscriptionId }) {
        cancelled.push(subscriptionId);
      },
      ...overrides,
    });
    store.playerEmails.set(PLAYER_ID, 'arya@example.com');
    return {
      deps: {
        store,
        stripe,
        email: {
          async sendEmail(m: { to: string; subject: string }) {
            sent.push(m);
          },
        },
        appBaseUrl: 'https://app.test',
        now: () => NOW,
      },
      cancelled,
      sent,
    };
  }

  it('ends a membership paused for over 90 days: Stripe cancel, goodbye, departure, one FYI', async () => {
    store.patrons.push(
      patron({
        id: 'mira',
        name: 'Mira Kovac',
        status: 'paused',
        pausedAt: pausedDaysAgo(91),
        since: '2025-12-12T00:00:00Z',
      }),
      patron({ id: 'tom', name: 'Tom Brandt', status: 'paused', pausedAt: pausedDaysAgo(89) }),
    );
    const { deps, cancelled, sent } = sweepDeps();
    expect(await runPausedExpirySweep(deps)).toEqual({ ended: 1, failed: 0 });
    expect(cancelled).toEqual(['sub_mira']);
    expect(sent.map((m) => m.to)).toEqual(['mira@example.com']);
    const mira = store.patrons.find((p) => p.id === 'mira')!;
    expect(mira).toMatchObject({
      status: 'left',
      leftReason: PAUSED_EXPIRY_ENDED_REASON,
      pausedAt: null,
    });
    expect(store.events).toEqual([
      expect.objectContaining({
        kind: 'leave',
        patronId: 'mira',
        attribution: '9 months. Ended after 90 days paused.',
      }),
    ]);
    expect(store.notifications).toEqual([
      expect.objectContaining({ category: 'fyi', title: 'Mira K. left Courtside' }),
    ]);
    expect(store.patrons.find((p) => p.id === 'tom')!.status).toBe('paused');
  });

  it('is idempotent: a second run the same day ends nothing more', async () => {
    store.patrons.push(
      patron({ id: 'mira', name: 'Mira Kovac', status: 'paused', pausedAt: pausedDaysAgo(95) }),
    );
    const { deps, cancelled } = sweepDeps();
    await runPausedExpirySweep(deps);
    expect(await runPausedExpirySweep(deps)).toEqual({ ended: 0, failed: 0 });
    expect(cancelled).toEqual(['sub_mira']);
  });

  it('leaves a patron paused when Stripe refuses the cancel, for the next tick to retry', async () => {
    store.patrons.push(
      patron({ id: 'mira', name: 'Mira Kovac', status: 'paused', pausedAt: pausedDaysAgo(120) }),
    );
    const { deps, sent } = sweepDeps({
      async retrievePlatformBalance() {
        return [];
      },
      async cancelSubscription() {
        throw new Error('Stripe down');
      },
    });
    expect(await runPausedExpirySweep(deps)).toEqual({ ended: 0, failed: 1 });
    expect(store.patrons[0]!.status).toBe('paused');
    expect(sent).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it('stamps pausedAt when a pause arrives from Stripe directly, and clears it on resume', async () => {
    store.patrons.push(
      patron({ id: 'mira', name: 'Mira Kovac', stripeSubscriptionId: 'sub_mira' }),
    );
    let paused = true;
    const stripe = fakeStripe({
      async retrieveSubscription() {
        return subscription({ paused });
      },
    });
    await applyStripeEvent(
      { store, stripe, now: () => NOW },
      event('customer.subscription.updated', { id: 'sub_mira' }, 'evt_p1'),
    );
    expect(store.patrons[0]!.pausedAt).toBe(NOW.toISOString());
    paused = false;
    await applyStripeEvent(
      { store, stripe, now: () => NOW },
      event('customer.subscription.updated', { id: 'sub_mira' }, 'evt_p2'),
    );
    expect(store.patrons[0]!.pausedAt).toBeNull();
  });
});
