import { describe, expect, it, vi } from 'vitest';
import type { ApprovalGateDb, ApprovalRecord } from './gate';
import { ApprovalNotFoundError, ApprovalPayloadMismatchError } from './errors';
import type { EmailClient, SendEmailInput } from './resend-client';
import type { FansStripeClient } from './stripe-client';
import {
  PRO_PAGE_CAP,
  TierNotSellableError,
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
    ...overrides,
  };
  return { db, calls };
}

function fakeStripe(): FansStripeClient & { calls: Record<string, ReturnType<typeof vi.fn>> } {
  const calls = {
    createExpressAccount: vi.fn(async () => ({ id: 'acct_new' })),
    createAccountLink: vi.fn(async () => ({ url: 'https://connect.stripe.test/onboard' })),
    upsertTierPrice: vi.fn(async () => ({ productId: 'prod_1', priceId: 'price_2' })),
    createCheckoutSession: vi.fn(async () => ({
      id: 'cs_1',
      url: 'https://checkout.stripe.test/cs_1',
    })),
  };
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
