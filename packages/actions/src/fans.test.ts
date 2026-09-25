import { describe, expect, it, vi } from 'vitest';
import type { ApprovalGateDb, ApprovalRecord } from './gate';
import { ApprovalNotFoundError, ApprovalPayloadMismatchError } from './errors';
import {
  billingPauseNotice,
  membershipEndedNotice,
  pausedMembershipEndDate,
} from '@procircuit/shared';
import type { EmailClient, SendEmailInput } from './resend-client';
import type { FansStripeClient } from './stripe-client';
import {
  PRO_PAGE_CAP,
  ManageLinkInvalidError,
  MANAGE_LINK_TTL_MS,
  TierNotSellableError,
  createManageToken,
  openPatronPortal,
  pausePatronBilling,
  endPausedMembership,
  requestPatronManageLink,
  resumePatronBilling,
  verifyManageToken,
  WaitlistEntryUnavailableError,
  createPatronCheckout,
  inviteFromWaitlist,
  patronNotePayload,
  publishTier,
  sendPatronNote,
  slugFromName,
  startConnectOnboarding,
  tierChangePayload,
  type FansActionsDb,
  type FansProgramme,
  type FansTier,
} from './fans';

// Same fake gate as entries.test.ts / receivables.test.ts: a real
// unique-claim check, not a call-count assertion.
function fakeGateDb(approvals: ApprovalRecord[]): ApprovalGateDb {
  const byId = new Map(approvals.map((a) => [a.id, a]));
  const claimed = new Set<string>();
  return {
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
}

const PLAYER = {
  id: 'player-1',
  name: 'Arya Dubey',
  email: 'arya@example.com',
  tier: 'pro' as string | null,
  homeCurrency: 'AUD',
  country: 'Australia',
};

const PROGRAMME: FansProgramme = {
  playerId: 'player-1',
  slug: 'arya-dubey',
  stripeAccountId: 'acct_123',
  kycStatus: 'complete',
  chargesEnabled: true,
};

const COURTSIDE: FansTier = {
  id: 'tier-1',
  playerId: 'player-1',
  position: 1,
  name: 'Courtside',
  price: 29,
  currency: 'AUD',
  perks: 'Every update.',
  stripeProductId: 'prod_1',
  stripePriceId: 'price_1',
};

function fakeDb(overrides: Partial<FansActionsDb> = {}) {
  const calls = {
    saveTier: vi.fn<FansActionsDb['saveTier']>(async () => ({ id: 'tier-1' })),
    createProgramme: vi.fn<FansActionsDb['createProgramme']>(async () => undefined),
    insertNoteSent: vi.fn<FansActionsDb['insertNoteSent']>(async () => undefined),
    markWaitlistInvited: vi.fn<FansActionsDb['markWaitlistInvited']>(async () => undefined),
    setPatronStatus: vi.fn<FansActionsDb['setPatronStatus']>(async () => undefined),
  };
  const db: FansActionsDb = {
    async getPlayer(id) {
      return id === PLAYER.id ? PLAYER : null;
    },
    async getProgramme(id) {
      return id === PROGRAMME.playerId ? PROGRAMME : null;
    },
    async getProgrammeBySlug(slug) {
      return slug === PROGRAMME.slug ? PROGRAMME : null;
    },
    async isSlugTaken() {
      return false;
    },
    createProgramme: calls.createProgramme,
    async getTierByPosition(_p, position) {
      return position === 1 ? COURTSIDE : null;
    },
    async getTierById(id) {
      return id === COURTSIDE.id ? COURTSIDE : null;
    },
    saveTier: calls.saveTier,
    async countActivePatrons() {
      return 12;
    },
    async countActivePatronsOnTier() {
      return 8;
    },
    async getPatron(_player, patronId) {
      return patronId === 'anna'
        ? { id: 'anna', name: 'Anna Pichler', email: 'anna@example.com' }
        : null;
    },
    insertNoteSent: calls.insertNoteSent,
    async getWaitlistEntry(_player, id) {
      return id === 'w1'
        ? { id: 'w1', email: 'fan@example.com', invitedAt: null, convertedAt: null }
        : null;
    },
    markWaitlistInvited: calls.markWaitlistInvited,
    async findCurrentPatronsByEmail(_player, email) {
      return email === 'anna@example.com' ? [{ id: 'anna' }] : [];
    },
    async getPatronBilling(id) {
      return id === 'anna'
        ? { id: 'anna', playerId: 'player-1', stripeCustomerId: 'cus_anna', status: 'active' }
        : null;
    },
    async listPatronsByStatus(_player, statuses) {
      const all = [
        {
          id: 'anna',
          name: 'Anna Pichler',
          email: 'anna@example.com',
          stripeSubscriptionId: 'sub_anna',
          status: 'active',
        },
        {
          id: 'tom',
          name: 'Tom Brandt',
          email: 'tom@example.com',
          stripeSubscriptionId: 'sub_tom',
          status: 'past_due',
        },
        {
          id: 'sophie',
          name: 'Sophie Taler',
          email: null,
          stripeSubscriptionId: 'sub_sophie',
          status: 'paused',
        },
      ];
      return all.filter((p) => statuses.includes(p.status));
    },
    setPatronStatus: calls.setPatronStatus,
    async listTiers() {
      return [
        COURTSIDE,
        {
          ...COURTSIDE,
          id: 'tier-2',
          position: 2,
          stripeProductId: 'prod_2',
          stripePriceId: 'price_2',
        },
      ];
    },
    ...overrides,
  };
  return { db, calls };
}

function makeStripeCalls() {
  return {
    createExpressAccount: vi.fn(async () => ({ id: 'acct_new' })),
    createAccountLink: vi.fn(async () => ({ url: 'https://connect.stripe.test/onboard' })),
    upsertTierPrice: vi.fn(async () => ({ productId: 'prod_1', priceId: 'price_2' })),
    createCheckoutSession: vi.fn(async () => ({
      id: 'cs_1',
      url: 'https://checkout.stripe.test/cs_1',
    })),
    createPortalSession: vi.fn(async () => ({ url: 'https://billing.stripe.test/p/1' })),
    setSubscriptionPaused: vi.fn<
      (input: { account: string; subscriptionId: string; paused: boolean }) => Promise<void>
    >(async () => undefined),
    cancelSubscription: vi.fn<
      (input: { account: string; subscriptionId: string }) => Promise<void>
    >(async () => undefined),
  };
}

function fakeStripe(): FansStripeClient & { calls: ReturnType<typeof makeStripeCalls> } {
  const calls = makeStripeCalls();
  return {
    calls,
    createExpressAccount: calls.createExpressAccount,
    createAccountLink: calls.createAccountLink,
    async retrieveAccount() {
      throw new Error('unused');
    },
    upsertTierPrice: calls.upsertTierPrice,
    createCheckoutSession: calls.createCheckoutSession,
    async retrieveCheckoutSession() {
      throw new Error('unused');
    },
    async retrieveSubscription() {
      throw new Error('unused');
    },
    async listPayoutBalanceLines() {
      return [];
    },
    verifyWebhook() {
      throw new Error('unused');
    },
    createPortalSession: calls.createPortalSession,
    setSubscriptionPaused: calls.setSubscriptionPaused,
    cancelSubscription: calls.cancelSubscription,
  };
}

function fakeEmail() {
  const sent: SendEmailInput[] = [];
  const client: EmailClient = {
    async sendEmail(input) {
      sent.push(input);
    },
  };
  return { client, sent };
}

const approval = (actionType: string, payload: ApprovalRecord['payload']): ApprovalRecord => ({
  id: 'approval-1',
  playerId: 'player-1',
  actionType,
  payload,
});

describe('every Fans side effect fails without an approval', () => {
  it('Connect onboarding never reaches Stripe without one', async () => {
    const stripe = fakeStripe();
    await expect(
      startConnectOnboarding(fakeGateDb([]), fakeDb().db, stripe, {
        approvalId: 'missing',
        playerId: 'player-1',
        appBaseUrl: 'https://app.test',
      }),
    ).rejects.toBeInstanceOf(ApprovalNotFoundError);
    expect(stripe.calls.createExpressAccount).not.toHaveBeenCalled();
    expect(stripe.calls.createAccountLink).not.toHaveBeenCalled();
  });

  it('publishing a tier never reaches Stripe without one', async () => {
    const stripe = fakeStripe();
    await expect(
      publishTier(fakeGateDb([]), fakeDb().db, stripe, {
        approvalId: 'missing',
        playerId: 'player-1',
        position: 1,
        name: 'Courtside',
        price: 29,
        perks: '',
      }),
    ).rejects.toBeInstanceOf(ApprovalNotFoundError);
    expect(stripe.calls.upsertTierPrice).not.toHaveBeenCalled();
  });

  it('a patron note is never emailed without one, or with an edited text the player did not approve', async () => {
    const email = fakeEmail();
    await expect(
      sendPatronNote(fakeGateDb([]), fakeDb().db, email.client, {
        approvalId: 'missing',
        playerId: 'player-1',
        patronId: 'anna',
        kind: 'thanks',
        text: 'Anna, thank you.',
        draftText: null,
        device: null,
      }),
    ).rejects.toBeInstanceOf(ApprovalNotFoundError);

    const gate = fakeGateDb([
      approval(
        'patron_send',
        patronNotePayload({ patronId: 'anna', kind: 'thanks', text: 'Anna, thank you.' }),
      ),
    ]);
    await expect(
      sendPatronNote(gate, fakeDb().db, email.client, {
        approvalId: 'approval-1',
        playerId: 'player-1',
        patronId: 'anna',
        kind: 'thanks',
        text: 'Anna, thank you. Also, please upgrade.',
        draftText: null,
        device: null,
      }),
    ).rejects.toBeInstanceOf(ApprovalPayloadMismatchError);
    expect(email.sent).toHaveLength(0);
  });

  it('a waitlist invitation is never emailed without one', async () => {
    const email = fakeEmail();
    await expect(
      inviteFromWaitlist(fakeGateDb([]), fakeDb().db, email.client, {
        approvalId: 'missing',
        playerId: 'player-1',
        entryId: 'w1',
        appBaseUrl: 'https://app.test',
      }),
    ).rejects.toBeInstanceOf(ApprovalNotFoundError);
    expect(email.sent).toHaveLength(0);
  });
});

describe('startConnectOnboarding (connect_onboard)', () => {
  it("creates one Express account and the programme slug, then returns Stripe's onboarding link", async () => {
    const stripe = fakeStripe();
    const { db, calls } = fakeDb({ getProgramme: async () => null });
    const result = await startConnectOnboarding(
      fakeGateDb([approval('connect_onboard', {})]),
      db,
      stripe,
      { approvalId: 'approval-1', playerId: 'player-1', appBaseUrl: 'https://app.test' },
    );
    expect(stripe.calls.createExpressAccount).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'arya@example.com', country: 'AU' }),
    );
    expect(calls.createProgramme).toHaveBeenCalledWith({
      playerId: 'player-1',
      slug: 'arya-dubey',
      stripeAccountId: 'acct_new',
    });
    expect(result.url).toBe('https://connect.stripe.test/onboard');
    expect(stripe.calls.createAccountLink).toHaveBeenCalledWith(
      expect.objectContaining({ returnUrl: 'https://app.test/fans?stripe=return' }),
    );
  });

  it('reuses the existing account when onboarding is resumed', async () => {
    const stripe = fakeStripe();
    await startConnectOnboarding(
      fakeGateDb([approval('connect_onboard', {})]),
      fakeDb().db,
      stripe,
      {
        approvalId: 'approval-1',
        playerId: 'player-1',
        appBaseUrl: 'https://app.test',
      },
    );
    expect(stripe.calls.createExpressAccount).not.toHaveBeenCalled();
    expect(stripe.calls.createAccountLink).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'acct_123' }),
    );
  });

  it("builds PRD-04's slug from the player's name", () => {
    expect(slugFromName('Arya Dubey')).toBe('arya-dubey');
    expect(slugFromName('Jürgen  Müller-Łódź')).toBe('jurgen-muller-odz');
  });
});

describe('publishTier (tier_change)', () => {
  const input = { position: 1, name: 'Courtside', price: 32, perks: 'Every update.' };

  it("prices in the player's home currency and grandfathers existing patrons", async () => {
    const stripe = fakeStripe();
    const { db, calls } = fakeDb();
    const result = await publishTier(
      fakeGateDb([approval('tier_change', tierChangePayload(input))]),
      db,
      stripe,
      { approvalId: 'approval-1', playerId: 'player-1', ...input },
    );
    expect(stripe.calls.upsertTierPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        account: 'acct_123',
        currentPriceId: 'price_1',
        amountMinor: 3200,
        currency: 'AUD',
      }),
    );
    expect(calls.saveTier).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tier-1', price: 32, stripePriceId: 'price_2' }),
    );
    expect(result).toEqual({ tierId: 'tier-1', patronsAffectedByPrice: 0, patronsOnTier: 8 });
  });

  it('refuses a price with more than two decimals before touching the gate', async () => {
    await expect(
      publishTier(fakeGateDb([]), fakeDb().db, fakeStripe(), {
        approvalId: 'approval-1',
        playerId: 'player-1',
        ...input,
        price: 29.999,
      }),
    ).rejects.toThrow(/two decimals/);
  });
});

describe('sendPatronNote (patron_send, P-11)', () => {
  it('sends one email from the player, replies to the player, and logs the text as sent', async () => {
    const email = fakeEmail();
    const { db, calls } = fakeDb();
    const text = 'Anna, I noticed you moved on last month. Thank you.';
    await sendPatronNote(
      fakeGateDb([
        approval('patron_send', patronNotePayload({ patronId: 'anna', kind: 'thanks', text })),
      ]),
      db,
      email.client,
      {
        approvalId: 'approval-1',
        playerId: 'player-1',
        patronId: 'anna',
        kind: 'thanks',
        text,
        draftText: 'Anna, I noticed you moved on last month.',
        device: 'test',
      },
    );
    expect(email.sent).toEqual([
      expect.objectContaining({
        to: 'anna@example.com',
        fromName: 'Arya Dubey',
        replyTo: 'arya@example.com',
        subject: 'A note from Arya',
      }),
    ]);
    expect(calls.insertNoteSent).toHaveBeenCalledWith(
      expect.objectContaining({ patronId: 'anna', text, approvalId: 'approval-1' }),
    );
  });
});

describe('inviteFromWaitlist (waitlist_invite, P-4)', () => {
  it('is refused while a Pro page is still full', async () => {
    const email = fakeEmail();
    const { db, calls } = fakeDb({ countActivePatrons: async () => PRO_PAGE_CAP });
    await expect(
      inviteFromWaitlist(
        fakeGateDb([approval('waitlist_invite', { entryId: 'w1' })]),
        db,
        email.client,
        {
          approvalId: 'approval-1',
          playerId: 'player-1',
          entryId: 'w1',
          appBaseUrl: 'https://app.test',
        },
      ),
    ).rejects.toBeInstanceOf(WaitlistEntryUnavailableError);
    expect(email.sent).toHaveLength(0);
    expect(calls.markWaitlistInvited).not.toHaveBeenCalled();
  });

  it('emails the page link and records the invitation once a place is open', async () => {
    const email = fakeEmail();
    const { db, calls } = fakeDb();
    await inviteFromWaitlist(
      fakeGateDb([approval('waitlist_invite', { entryId: 'w1' })]),
      db,
      email.client,
      {
        approvalId: 'approval-1',
        playerId: 'player-1',
        entryId: 'w1',
        appBaseUrl: 'https://app.test',
      },
    );
    expect(email.sent[0]!.to).toBe('fan@example.com');
    expect(email.sent[0]!.html).toContain('https://app.test/p/arya-dubey');
    expect(calls.markWaitlistInvited).toHaveBeenCalledWith('w1', expect.any(String));
  });
});

describe('createPatronCheckout (P-2, P-3, M-TIER-3)', () => {
  const base = {
    slug: 'arya-dubey',
    tierId: 'tier-1',
    source: 'draw' as const,
    namesOptIn: true,
    appBaseUrl: 'https://app.test',
  };

  it("opens Checkout on the player's account with the 8 percent Pro fee", async () => {
    const stripe = fakeStripe();
    const result = await createPatronCheckout(fakeDb().db, stripe, base);
    expect(result).toEqual({ kind: 'checkout', url: 'https://checkout.stripe.test/cs_1' });
    expect(stripe.calls.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        account: 'acct_123',
        priceId: 'price_1',
        applicationFeePercent: 8,
        metadata: expect.objectContaining({ source: 'draw', names_opt_in: 'true' }),
      }),
    );
  });

  it('P-AC-9: the 51st patron on Pro gets the waitlist, and no Checkout opens', async () => {
    const stripe = fakeStripe();
    const result = await createPatronCheckout(
      fakeDb({ countActivePatrons: async () => PRO_PAGE_CAP }).db,
      stripe,
      base,
    );
    expect(result).toEqual({ kind: 'waitlist' });
    expect(stripe.calls.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('has no cap on Elite and takes 5 percent', async () => {
    const stripe = fakeStripe();
    const { db } = fakeDb({
      getPlayer: async () => ({ ...PLAYER, tier: 'elite' }),
      countActivePatrons: async () => 400,
    });
    await createPatronCheckout(db, stripe, base);
    expect(stripe.calls.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ applicationFeePercent: 5 }),
    );
  });

  it('sells nothing on Free or before KYC is complete', async () => {
    await expect(
      createPatronCheckout(
        fakeDb({ getPlayer: async () => ({ ...PLAYER, tier: 'free' }) }).db,
        fakeStripe(),
        base,
      ),
    ).rejects.toBeInstanceOf(TierNotSellableError);
    await expect(
      createPatronCheckout(
        fakeDb({
          getProgrammeBySlug: async () => ({
            ...PROGRAMME,
            kycStatus: 'pending',
            chargesEnabled: false,
          }),
        }).db,
        fakeStripe(),
        base,
      ),
    ).rejects.toBeInstanceOf(TierNotSellableError);
  });
});

describe('step 4.1b · the patron manage link (P-17)', () => {
  const SECRET = 'test-secret';
  const input = { slug: 'arya-dubey', appBaseUrl: 'https://app.test', linkSecret: SECRET };

  it('signs a one-hour token and refuses a tampered or expired one', () => {
    const now = new Date('2026-09-24T10:00:00Z');
    const token = createManageToken(SECRET, 'anna', now);
    expect(verifyManageToken(SECRET, token, now)).toBe('anna');
    expect(() => verifyManageToken(SECRET, token.replace('anna', 'tom'), now)).toThrow(
      ManageLinkInvalidError,
    );
    expect(() => verifyManageToken('other-secret', token, now)).toThrow(/bad signature/);
    expect(() =>
      verifyManageToken(SECRET, token, new Date(now.getTime() + MANAGE_LINK_TTL_MS + 1)),
    ).toThrow(/expired/);
  });

  it('emails the link only to a current patron, and looks the same either way', async () => {
    const email = fakeEmail();
    await requestPatronManageLink(fakeDb().db, email.client, {
      ...input,
      email: 'nobody@example.com',
    });
    expect(email.sent).toHaveLength(0);
    await requestPatronManageLink(fakeDb().db, email.client, {
      ...input,
      email: ' Anna@Example.com ',
    });
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({
      to: 'anna@example.com',
      fromName: 'Arya Dubey',
      replyTo: 'arya@example.com',
    });
    expect(email.sent[0]!.html).toContain('https://app.test/p/arya-dubey/manage?t=');
  });

  it("opens Stripe's portal on the player's account with every tier switchable, only for a valid token", async () => {
    const stripe = fakeStripe();
    await expect(
      openPatronPortal(fakeDb().db, stripe, { ...input, token: 'anna.1.forged' }),
    ).rejects.toBeInstanceOf(ManageLinkInvalidError);
    expect(stripe.calls.createPortalSession).not.toHaveBeenCalled();

    const result = await openPatronPortal(fakeDb().db, stripe, {
      ...input,
      token: createManageToken(SECRET, 'anna'),
    });
    expect(result.url).toBe('https://billing.stripe.test/p/1');
    expect(stripe.calls.createPortalSession).toHaveBeenCalledWith({
      account: 'acct_123',
      customerId: 'cus_anna',
      returnUrl: 'https://app.test/p/arya-dubey',
      products: [
        { productId: 'prod_1', priceId: 'price_1' },
        { productId: 'prod_2', priceId: 'price_2' },
      ],
    });
  });
});

describe('step 4.1b · pausing and resuming patron billing (P-18, M-TIER-2)', () => {
  const input = {
    approvalId: 'approval-1',
    playerId: 'player-1',
    appBaseUrl: 'https://app.test',
    linkSecret: 's',
  };

  it("never touches Stripe or emails anyone without the player's approval", async () => {
    const stripe = fakeStripe();
    const email = fakeEmail();
    await expect(
      pausePatronBilling(fakeGateDb([]), fakeDb().db, stripe, email.client, input),
    ).rejects.toBeInstanceOf(ApprovalNotFoundError);
    await expect(
      resumePatronBilling(fakeGateDb([]), fakeDb().db, stripe, email.client, input),
    ).rejects.toBeInstanceOf(ApprovalNotFoundError);
    expect(stripe.calls.setSubscriptionPaused).not.toHaveBeenCalled();
    expect(email.sent).toHaveLength(0);
  });

  it('pauses every paying patron and emails each the exact notice the player saw', async () => {
    const stripe = fakeStripe();
    const email = fakeEmail();
    const { db, calls } = fakeDb();
    const result = await pausePatronBilling(
      fakeGateDb([approval('patron_billing_pause', {})]),
      db,
      stripe,
      email.client,
      input,
    );
    expect(result).toEqual({ changed: 2, failed: [], unnotified: [] });
    expect(stripe.calls.setSubscriptionPaused.mock.calls.map((c) => c[0])).toEqual([
      { account: 'acct_123', subscriptionId: 'sub_anna', paused: true },
      { account: 'acct_123', subscriptionId: 'sub_tom', paused: true },
    ]);
    expect(calls.setPatronStatus.mock.calls).toEqual([
      ['anna', 'paused'],
      ['tom', 'paused'],
    ]);
    const notice = billingPauseNotice({
      playerName: 'Arya Dubey',
      endsOn: pausedMembershipEndDate(new Date()),
    });
    expect(email.sent.map((m) => m.to)).toEqual(['anna@example.com', 'tom@example.com']);
    expect(email.sent[0]!.subject).toBe(notice.subject);
    for (const paragraph of notice.paragraphs) {
      expect(email.sent[0]!.html).toContain(paragraph.replace(/'/g, "'"));
    }
    expect(email.sent[0]!.html).toContain('/p/arya-dubey/manage?t=');
  });

  it('leaves a patron whose Stripe call fails untouched and unemailed, and says so', async () => {
    const stripe = fakeStripe();
    stripe.calls.setSubscriptionPaused.mockImplementation(async (i) => {
      if (i.subscriptionId === 'sub_tom') throw new Error('Stripe down');
    });
    const email = fakeEmail();
    const { db, calls } = fakeDb();
    const result = await pausePatronBilling(
      fakeGateDb([approval('patron_billing_pause', {})]),
      db,
      stripe,
      email.client,
      input,
    );
    expect(result).toEqual({ changed: 1, failed: ['tom'], unnotified: [] });
    expect(calls.setPatronStatus.mock.calls).toEqual([['anna', 'paused']]);
    expect(email.sent.map((m) => m.to)).toEqual(['anna@example.com']);
  });

  it('resumes paused patrons on Pro, and refuses to on Free', async () => {
    const stripe = fakeStripe();
    const { db, calls } = fakeDb();
    const result = await resumePatronBilling(
      fakeGateDb([approval('patron_billing_resume', {})]),
      db,
      stripe,
      fakeEmail().client,
      input,
    );
    // Sophie has no email on file: resumed, but reported as not notified.
    expect(result).toEqual({ changed: 1, failed: [], unnotified: ['sophie'] });
    expect(stripe.calls.setSubscriptionPaused).toHaveBeenCalledWith({
      account: 'acct_123',
      subscriptionId: 'sub_sophie',
      paused: false,
    });
    expect(calls.setPatronStatus).toHaveBeenCalledWith('sophie', 'active');

    await expect(
      resumePatronBilling(
        fakeGateDb([approval('patron_billing_resume', {})]),
        fakeDb({ getPlayer: async () => ({ ...PLAYER, tier: 'free' }) }).db,
        fakeStripe(),
        fakeEmail().client,
        input,
      ),
    ).rejects.toBeInstanceOf(TierNotSellableError);
  });
});

describe('step 4.1b · an email failure never stops a billing change', () => {
  it('keeps pausing the rest when one notice fails to send, and reports who missed it', async () => {
    const stripe = fakeStripe();
    const { db, calls } = fakeDb();
    const email: EmailClient = {
      async sendEmail(m) {
        if (m.to === 'anna@example.com') throw new Error('Resend refused');
      },
    };
    const result = await pausePatronBilling(
      fakeGateDb([approval('patron_billing_pause', {})]),
      db,
      stripe,
      email,
      {
        approvalId: 'approval-1',
        playerId: 'player-1',
        appBaseUrl: 'https://app.test',
        linkSecret: 's',
      },
    );
    expect(result).toEqual({ changed: 2, failed: [], unnotified: ['anna'] });
    expect(calls.setPatronStatus.mock.calls).toEqual([
      ['anna', 'paused'],
      ['tom', 'paused'],
    ]);
  });
});

describe('step 4.1b follow-up · a membership paused for 90 days ends', () => {
  const input = {
    account: 'acct_123',
    subscriptionId: 'sub_anna',
    patronEmail: 'anna@example.com',
    playerName: 'Arya Dubey',
    playerEmail: 'arya@example.com',
    pageUrl: 'https://app.test/p/arya-dubey',
  };

  it('names the 90-day end date in the pause notice the player approves', () => {
    const endsOn = pausedMembershipEndDate(new Date('2026-09-25T00:00:00Z'));
    expect(endsOn).toBe('24 December 2026');
    expect(billingPauseNotice({ playerName: 'Arya Dubey', endsOn }).paragraphs[1]).toContain(
      'it ends on 24 December 2026 and nothing more is ever charged',
    );
  });

  it('cancels the subscription and sends the goodbye', async () => {
    const stripe = fakeStripe();
    const email = fakeEmail();
    expect(await endPausedMembership(stripe, email.client, input)).toEqual({ notified: true });
    expect(stripe.calls.cancelSubscription).toHaveBeenCalledWith({
      account: 'acct_123',
      subscriptionId: 'sub_anna',
    });
    expect(email.sent[0]).toMatchObject({
      to: 'anna@example.com',
      subject: membershipEndedNotice({ playerName: 'Arya Dubey' }).subject,
    });
    expect(email.sent[0]!.html).toContain('https://app.test/p/arya-dubey');
  });

  it('still ends the membership when the goodbye fails to send', async () => {
    const stripe = fakeStripe();
    const failing: EmailClient = {
      async sendEmail() {
        throw new Error('Resend refused');
      },
    };
    expect(await endPausedMembership(stripe, failing, input)).toEqual({ notified: false });
    expect(stripe.calls.cancelSubscription).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when Stripe refuses the cancel, so the sweep retries tomorrow', async () => {
    const stripe = fakeStripe();
    stripe.calls.cancelSubscription.mockRejectedValue(new Error('Stripe down'));
    const email = fakeEmail();
    await expect(endPausedMembership(stripe, email.client, input)).rejects.toThrow('Stripe down');
    expect(email.sent).toHaveLength(0);
  });
});
