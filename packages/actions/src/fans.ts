import type { Database, Json } from '@procircuit/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type ApprovalGateDb, runGatedAction } from './gate';
import type { EmailClient } from './resend-client';
import { stripeCountryCode, type FansStripeClient } from './stripe-client';

// Fans' side effects (PRD-04 section 3's approval gate): every one that
// reaches Stripe or a patron's inbox on the player's behalf runs through
// runGatedAction, the same shape as receivables.ts and entries.ts, including
// their central discipline: anything that matters (the patron's email
// address, the tier's currency, whether the page has room) comes from the
// server's own rows, never the approval payload.
//
//   connect_onboard  startConnectOnboarding  Stripe account + onboarding link
//   tier_change      publishTier             Stripe product + price
//   patron_send      sendPatronNote          one email to one patron (P-10, P-11)
//   waitlist_invite  inviteFromWaitlist      one email to one waitlisted person (P-4)
//
// createPatronCheckout is the one Stripe call here with no player approval
// behind it, deliberately: it is the patron's own tap on the player's public
// page, the patron completes payment on Stripe's own hosted page, and the
// tiers it can sell only exist because the player already approved
// publishing them (tier_change). The player never pays or sends anything
// through it.

const PLAN_FEE_PERCENT: Record<string, number> = { pro: 8, elite: 5 };
export const PRO_PAGE_CAP = 50;

export class FansProgrammeMissingError extends Error {
  constructor(readonly playerId: string) {
    super(`Player ${playerId} has no patron programme yet`);
    this.name = 'FansProgrammeMissingError';
  }
}

export class PatronNotFoundError extends Error {
  constructor(readonly patronId: string) {
    super(`No patron ${patronId} for this player`);
    this.name = 'PatronNotFoundError';
  }
}

export class PatronHasNoEmailError extends Error {
  constructor(readonly patronId: string) {
    super(`Patron ${patronId} has no email on file`);
    this.name = 'PatronHasNoEmailError';
  }
}

export class WaitlistEntryUnavailableError extends Error {
  constructor(
    readonly entryId: string,
    reason: string,
  ) {
    super(`Waitlist entry ${entryId} cannot be invited: ${reason}`);
    this.name = 'WaitlistEntryUnavailableError';
  }
}

export class TierNotSellableError extends Error {
  constructor(reason: string) {
    super(`This tier is not open for sign-up: ${reason}`);
    this.name = 'TierNotSellableError';
  }
}

export class InvalidTierInputError extends Error {
  constructor(reason: string) {
    super(`Invalid tier: ${reason}`);
    this.name = 'InvalidTierInputError';
  }
}

export interface FansPlayer {
  id: string;
  name: string;
  email: string;
  tier: string | null;
  homeCurrency: string;
  country: string | null;
}

export interface FansProgramme {
  playerId: string;
  slug: string;
  stripeAccountId: string | null;
  kycStatus: 'not_started' | 'pending' | 'complete' | 'action_required';
  chargesEnabled: boolean;
}

export interface FansTier {
  id: string;
  playerId: string;
  position: number;
  name: string;
  price: number;
  currency: string;
  perks: string;
  stripeProductId: string | null;
  stripePriceId: string | null;
}

export interface FansActionsDb {
  getPlayer(playerId: string): Promise<FansPlayer | null>;
  getProgramme(playerId: string): Promise<FansProgramme | null>;
  getProgrammeBySlug(slug: string): Promise<FansProgramme | null>;
  isSlugTaken(slug: string): Promise<boolean>;
  createProgramme(input: {
    playerId: string;
    slug: string;
    stripeAccountId: string;
  }): Promise<void>;
  getTierByPosition(playerId: string, position: number): Promise<FansTier | null>;
  getTierById(tierId: string): Promise<FansTier | null>;
  saveTier(input: Omit<FansTier, 'id'> & { id: string | null }): Promise<{ id: string }>;
  countActivePatrons(playerId: string): Promise<number>;
  countActivePatronsOnTier(tierId: string): Promise<number>;
  getPatron(
    playerId: string,
    patronId: string,
  ): Promise<{ id: string; name: string; email: string | null } | null>;
  insertNoteSent(input: {
    playerId: string;
    patronId: string;
    approvalId: string;
    kind: PatronNoteKind;
    text: string;
    draftText: string | null;
    device: string | null;
  }): Promise<void>;
  getWaitlistEntry(
    playerId: string,
    entryId: string,
  ): Promise<{
    id: string;
    email: string;
    invitedAt: string | null;
    convertedAt: string | null;
  } | null>;
  markWaitlistInvited(entryId: string, at: string): Promise<void>;
}

export type PatronNoteKind = 'thanks' | 'nudge' | 'checkin' | 'welcome';

/** "Arya Dubey" -> "arya-dubey" (PRD-04: procircuit.ai/p/arya-dubey). */
export function slugFromName(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return base.length >= 3 ? base : `player-${base || 'page'}`;
}

async function uniqueSlug(db: FansActionsDb, name: string): Promise<string> {
  const base = slugFromName(name);
  if (!(await db.isSlugTaken(base))) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`;
    if (!(await db.isSlugTaken(candidate))) return candidate;
  }
  throw new Error(`Could not find a free slug for ${base}`);
}

// ---------------------------------------------------------------------------
// connect_onboard
// ---------------------------------------------------------------------------

export interface StartConnectOnboardingInput {
  approvalId: string;
  playerId: string;
  /** Server-configured, never client-supplied (same as account.ts's appBaseUrl). */
  appBaseUrl: string;
}

/**
 * Creates the player's Express account on first use (and the patron
 * programme row with its public slug), then returns a fresh Stripe-hosted
 * onboarding link. Tapping "Continue in Stripe" again later is a new
 * approval and a new link for the same account, never a second account.
 */
export async function startConnectOnboarding(
  gateDb: ApprovalGateDb,
  db: FansActionsDb,
  stripe: FansStripeClient,
  input: StartConnectOnboardingInput,
): Promise<{ url: string; stripeAccountId: string; slug: string }> {
  const payload: Json = {};
  return runGatedAction(
    gateDb,
    {
      approvalId: input.approvalId,
      playerId: input.playerId,
      actionType: 'connect_onboard',
      payload,
    },
    async () => {
      const player = await db.getPlayer(input.playerId);
      if (!player) throw new FansProgrammeMissingError(input.playerId);

      let programme = await db.getProgramme(input.playerId);
      if (!programme?.stripeAccountId) {
        const account = await stripe.createExpressAccount({
          email: player.email,
          country: stripeCountryCode(player.country),
          metadata: { procircuit_player_id: player.id },
        });
        const slug = programme?.slug ?? (await uniqueSlug(db, player.name));
        await db.createProgramme({ playerId: player.id, slug, stripeAccountId: account.id });
        programme = {
          playerId: player.id,
          slug,
          stripeAccountId: account.id,
          kycStatus: 'pending',
          chargesEnabled: false,
        };
      }

      const link = await stripe.createAccountLink({
        account: programme.stripeAccountId!,
        refreshUrl: `${input.appBaseUrl}/fans?stripe=refresh`,
        returnUrl: `${input.appBaseUrl}/fans?stripe=return`,
      });
      return { url: link.url, stripeAccountId: programme.stripeAccountId!, slug: programme.slug };
    },
  );
}

// ---------------------------------------------------------------------------
// tier_change
// ---------------------------------------------------------------------------

export interface PublishTierInput {
  approvalId: string;
  playerId: string;
  position: number;
  name: string;
  price: number;
  perks: string;
}

export interface PublishTierResult {
  tierId: string;
  /** Grandfathered (owner decision, step 4.1): existing patrons keep their price, so a price change affects 0 of them. */
  patronsAffectedByPrice: number;
  /** A rename or new perks sentence is seen by everyone on the tier. */
  patronsOnTier: number;
}

/** The payload the player approves, so the UI and the action hash the same object. */
export function tierChangePayload(input: {
  position: number;
  name: string;
  price: number;
  perks: string;
}): Json {
  return { position: input.position, name: input.name, price: input.price, perks: input.perks };
}

function validateTier(input: { position: number; name: string; price: number; perks: string }) {
  if (![1, 2, 3].includes(input.position))
    throw new InvalidTierInputError('position must be 1, 2 or 3');
  if (!input.name.trim() || input.name.length > 40)
    throw new InvalidTierInputError('name must be 1 to 40 characters');
  if (
    !(input.price >= 1) ||
    input.price > 10000 ||
    Math.round(input.price * 100) !== input.price * 100
  ) {
    throw new InvalidTierInputError('price must be between 1 and 10,000 with at most two decimals');
  }
  if (input.perks.length > 280) throw new InvalidTierInputError('perks sentence is too long');
}

/**
 * P-1: creates or edits one tier. Priced in the player's home currency, read
 * from the player row (M-CUR-1), never from the payload. A price change mints
 * a new Stripe price that only new sign-ups pay.
 */
export async function publishTier(
  gateDb: ApprovalGateDb,
  db: FansActionsDb,
  stripe: FansStripeClient,
  input: PublishTierInput,
): Promise<PublishTierResult> {
  validateTier(input);
  return runGatedAction(
    gateDb,
    {
      approvalId: input.approvalId,
      playerId: input.playerId,
      actionType: 'tier_change',
      payload: tierChangePayload(input),
    },
    async () => {
      const player = await db.getPlayer(input.playerId);
      const programme = await db.getProgramme(input.playerId);
      if (!player || !programme?.stripeAccountId)
        throw new FansProgrammeMissingError(input.playerId);

      const existing = await db.getTierByPosition(input.playerId, input.position);
      const currency = existing?.currency ?? player.homeCurrency;
      const { productId, priceId } = await stripe.upsertTierPrice({
        account: programme.stripeAccountId,
        productId: existing?.stripeProductId ?? null,
        currentPriceId: existing?.stripePriceId ?? null,
        name: input.name.trim(),
        description: input.perks.trim(),
        amountMinor: Math.round(input.price * 100),
        currency,
        metadata: { procircuit_player_id: input.playerId, position: String(input.position) },
      });
      const saved = await db.saveTier({
        id: existing?.id ?? null,
        playerId: input.playerId,
        position: input.position,
        name: input.name.trim(),
        price: input.price,
        currency,
        perks: input.perks.trim(),
        stripeProductId: productId,
        stripePriceId: priceId,
      });
      return {
        tierId: saved.id,
        patronsAffectedByPrice: 0,
        patronsOnTier: existing ? await db.countActivePatronsOnTier(existing.id) : 0,
      };
    },
  );
}

// ---------------------------------------------------------------------------
// patron_send
// ---------------------------------------------------------------------------

export interface SendPatronNoteInput {
  approvalId: string;
  playerId: string;
  patronId: string;
  kind: PatronNoteKind;
  /** The text as the player approved it, edits included. */
  text: string;
  /** What the agent drafted, kept for the audit row. */
  draftText: string | null;
  device: string | null;
}

export function patronNotePayload(input: {
  patronId: string;
  kind: PatronNoteKind;
  text: string;
}): Json {
  return { patronId: input.patronId, kind: input.kind, text: input.text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * P-10, P-11: one note to one patron, never in bulk. Sent with the player's
 * name on the From line and the player's own address as Reply-To, so replies
 * come to the player, not the agent.
 */
export async function sendPatronNote(
  gateDb: ApprovalGateDb,
  db: FansActionsDb,
  email: EmailClient,
  input: SendPatronNoteInput,
): Promise<{ patronId: string; sentAt: string }> {
  const text = input.text.trim();
  if (!text) throw new Error('A note needs some text');
  return runGatedAction(
    gateDb,
    {
      approvalId: input.approvalId,
      playerId: input.playerId,
      actionType: 'patron_send',
      payload: patronNotePayload({ patronId: input.patronId, kind: input.kind, text: input.text }),
    },
    async () => {
      const patron = await db.getPatron(input.playerId, input.patronId);
      if (!patron) throw new PatronNotFoundError(input.patronId);
      if (!patron.email) throw new PatronHasNoEmailError(input.patronId);
      const player = await db.getPlayer(input.playerId);
      if (!player) throw new FansProgrammeMissingError(input.playerId);

      const firstName = player.name.trim().split(/\s+/)[0] ?? player.name;
      await email.sendEmail({
        to: patron.email,
        fromName: player.name,
        replyTo: player.email,
        subject: `A note from ${firstName}`,
        html: text
          .split(/\n{2,}/)
          .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
          .join('\n'),
      });

      const sentAt = new Date().toISOString();
      await db.insertNoteSent({
        playerId: input.playerId,
        patronId: input.patronId,
        approvalId: input.approvalId,
        kind: input.kind,
        text,
        draftText: input.draftText,
        device: input.device,
      });
      return { patronId: input.patronId, sentAt };
    },
  );
}

// ---------------------------------------------------------------------------
// waitlist_invite
// ---------------------------------------------------------------------------

export interface InviteFromWaitlistInput {
  approvalId: string;
  playerId: string;
  entryId: string;
  appBaseUrl: string;
}

/**
 * P-4 with the owner's step 4.1 decision: the player confirms each
 * invitation. Refused while a Pro page is still full, so an invitation is
 * never a promise the page cannot keep.
 */
export async function inviteFromWaitlist(
  gateDb: ApprovalGateDb,
  db: FansActionsDb,
  email: EmailClient,
  input: InviteFromWaitlistInput,
): Promise<{ entryId: string; invitedAt: string }> {
  return runGatedAction(
    gateDb,
    {
      approvalId: input.approvalId,
      playerId: input.playerId,
      actionType: 'waitlist_invite',
      payload: { entryId: input.entryId },
    },
    async () => {
      const entry = await db.getWaitlistEntry(input.playerId, input.entryId);
      if (!entry) throw new WaitlistEntryUnavailableError(input.entryId, 'not found');
      if (entry.invitedAt)
        throw new WaitlistEntryUnavailableError(input.entryId, 'already invited');
      if (entry.convertedAt)
        throw new WaitlistEntryUnavailableError(input.entryId, 'already a patron');

      const player = await db.getPlayer(input.playerId);
      const programme = await db.getProgramme(input.playerId);
      if (!player || !programme) throw new FansProgrammeMissingError(input.playerId);
      if (player.tier === 'pro' && (await db.countActivePatrons(input.playerId)) >= PRO_PAGE_CAP) {
        throw new WaitlistEntryUnavailableError(input.entryId, 'the page is still full');
      }

      const firstName = player.name.trim().split(/\s+/)[0] ?? player.name;
      const pageUrl = `${input.appBaseUrl}/p/${programme.slug}?src=direct`;
      await email.sendEmail({
        to: entry.email,
        fromName: player.name,
        replyTo: player.email,
        subject: `A place has opened on ${firstName}'s patron page`,
        html: `<p>You asked to be first in when a place opened on ${escapeHtml(firstName)}'s patron page. One has.</p>
<p><a href="${pageUrl}">Choose a tier</a></p>
<p>Places are not held, so the first person through checkout gets it. If you've changed your mind, ignore this email: nothing happens and nothing is charged.</p>`,
      });
      const invitedAt = new Date().toISOString();
      await db.markWaitlistInvited(input.entryId, invitedAt);
      return { entryId: input.entryId, invitedAt };
    },
  );
}

// ---------------------------------------------------------------------------
// Patron checkout (not gated: see the file header)
// ---------------------------------------------------------------------------

export type PatronCheckoutResult = { kind: 'checkout'; url: string } | { kind: 'waitlist' };

export interface CreatePatronCheckoutInput {
  slug: string;
  tierId: string;
  source: 'profile' | 'draw' | 'direct' | 'unknown';
  namesOptIn: boolean;
  appBaseUrl: string;
}

/**
 * P-2, P-3, M-TIER-3: tiers sell only on Pro or Elite with KYC complete; at
 * the Pro cap the visitor is offered the waitlist instead of Checkout, never
 * an error. The fee percent is the player's plan's, read server-side.
 */
export async function createPatronCheckout(
  db: FansActionsDb,
  stripe: FansStripeClient,
  input: CreatePatronCheckoutInput,
): Promise<PatronCheckoutResult> {
  const programme = await db.getProgrammeBySlug(input.slug);
  if (!programme?.stripeAccountId) throw new TierNotSellableError('no patron page');
  const player = await db.getPlayer(programme.playerId);
  const feePercent = player?.tier ? PLAN_FEE_PERCENT[player.tier] : undefined;
  if (!player || feePercent === undefined)
    throw new TierNotSellableError('the player is not on Pro or Elite');
  if (programme.kycStatus !== 'complete' || !programme.chargesEnabled) {
    throw new TierNotSellableError('Stripe onboarding is not complete');
  }
  const tier = await db.getTierById(input.tierId);
  if (!tier || tier.playerId !== programme.playerId || !tier.stripePriceId) {
    throw new TierNotSellableError('unknown tier');
  }
  if (player.tier === 'pro' && (await db.countActivePatrons(programme.playerId)) >= PRO_PAGE_CAP) {
    return { kind: 'waitlist' };
  }

  const session = await stripe.createCheckoutSession({
    account: programme.stripeAccountId,
    priceId: tier.stripePriceId,
    applicationFeePercent: feePercent,
    successUrl: `${input.appBaseUrl}/p/${programme.slug}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${input.appBaseUrl}/p/${programme.slug}`,
    metadata: {
      procircuit_player_id: programme.playerId,
      procircuit_tier_id: tier.id,
      source: input.source,
      names_opt_in: input.namesOptIn ? 'true' : 'false',
    },
  });
  return { kind: 'checkout', url: session.url };
}

// ---------------------------------------------------------------------------
// The Supabase-backed implementation (service role, apps/api only).
// ---------------------------------------------------------------------------

export class SupabaseFansActionsDb implements FansActionsDb {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getPlayer(playerId: string): Promise<FansPlayer | null> {
    const { data, error } = await this.client
      .from('players')
      .select('id, name, email, tier, home_currency, country')
      .eq('id', playerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      tier: data.tier,
      homeCurrency: data.home_currency,
      country: data.country,
    };
  }

  private toProgramme(row: {
    player_id: string;
    slug: string;
    stripe_account_id: string | null;
    kyc_status: string;
    charges_enabled: boolean;
  }): FansProgramme {
    return {
      playerId: row.player_id,
      slug: row.slug,
      stripeAccountId: row.stripe_account_id,
      kycStatus: row.kyc_status as FansProgramme['kycStatus'],
      chargesEnabled: row.charges_enabled,
    };
  }

  async getProgramme(playerId: string): Promise<FansProgramme | null> {
    const { data, error } = await this.client
      .from('patron_programmes')
      .select('player_id, slug, stripe_account_id, kyc_status, charges_enabled')
      .eq('player_id', playerId)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toProgramme(data) : null;
  }

  async getProgrammeBySlug(slug: string): Promise<FansProgramme | null> {
    const { data, error } = await this.client
      .from('patron_programmes')
      .select('player_id, slug, stripe_account_id, kyc_status, charges_enabled')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toProgramme(data) : null;
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    const { count, error } = await this.client
      .from('patron_programmes')
      .select('player_id', { count: 'exact', head: true })
      .eq('slug', slug);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async createProgramme(input: { playerId: string; slug: string; stripeAccountId: string }) {
    const { error } = await this.client.from('patron_programmes').upsert(
      {
        player_id: input.playerId,
        slug: input.slug,
        stripe_account_id: input.stripeAccountId,
        kyc_status: 'pending',
      },
      { onConflict: 'player_id' },
    );
    if (error) throw error;
  }

  private toTier(row: Database['public']['Tables']['patron_tiers']['Row']): FansTier {
    return {
      id: row.id,
      playerId: row.player_id,
      position: row.position,
      name: row.name,
      price: Number(row.price),
      currency: row.currency,
      perks: row.perks,
      stripeProductId: row.stripe_product_id,
      stripePriceId: row.stripe_price_id,
    };
  }

  async getTierByPosition(playerId: string, position: number): Promise<FansTier | null> {
    const { data, error } = await this.client
      .from('patron_tiers')
      .select('*')
      .eq('player_id', playerId)
      .eq('position', position)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toTier(data) : null;
  }

  async getTierById(tierId: string): Promise<FansTier | null> {
    const { data, error } = await this.client
      .from('patron_tiers')
      .select('*')
      .eq('id', tierId)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toTier(data) : null;
  }

  async saveTier(input: Omit<FansTier, 'id'> & { id: string | null }): Promise<{ id: string }> {
    const row = {
      player_id: input.playerId,
      position: input.position,
      name: input.name,
      price: input.price,
      currency: input.currency,
      perks: input.perks,
      stripe_product_id: input.stripeProductId,
      stripe_price_id: input.stripePriceId,
    };
    const query = input.id
      ? this.client.from('patron_tiers').update(row).eq('id', input.id).select('id').single()
      : this.client.from('patron_tiers').insert(row).select('id').single();
    const { data, error } = await query;
    if (error) throw error;
    return { id: data.id };
  }

  async countActivePatrons(playerId: string): Promise<number> {
    const { count, error } = await this.client
      .from('patrons')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .in('status', ['active', 'past_due']);
    if (error) throw error;
    return count ?? 0;
  }

  async countActivePatronsOnTier(tierId: string): Promise<number> {
    const { count, error } = await this.client
      .from('patrons')
      .select('id', { count: 'exact', head: true })
      .eq('tier_id', tierId)
      .in('status', ['active', 'past_due']);
    if (error) throw error;
    return count ?? 0;
  }

  async getPatron(playerId: string, patronId: string) {
    const { data, error } = await this.client
      .from('patrons')
      .select('id, name, email')
      .eq('player_id', playerId)
      .eq('id', patronId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async insertNoteSent(input: {
    playerId: string;
    patronId: string;
    approvalId: string;
    kind: PatronNoteKind;
    text: string;
    draftText: string | null;
    device: string | null;
  }): Promise<void> {
    const { error } = await this.client.from('patron_notes_sent').insert({
      player_id: input.playerId,
      patron_id: input.patronId,
      approval_id: input.approvalId,
      kind: input.kind,
      text: input.text,
      draft_text: input.draftText,
      device: input.device,
    });
    if (error) throw error;
  }

  async getWaitlistEntry(playerId: string, entryId: string) {
    const { data, error } = await this.client
      .from('patron_waitlist')
      .select('id, email, invited_at, converted_at')
      .eq('player_id', playerId)
      .eq('id', entryId)
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          id: data.id,
          email: data.email,
          invitedAt: data.invited_at,
          convertedAt: data.converted_at,
        }
      : null;
  }

  async markWaitlistInvited(entryId: string, at: string): Promise<void> {
    const { error } = await this.client
      .from('patron_waitlist')
      .update({ invited_at: at })
      .eq('id', entryId);
    if (error) throw error;
  }
}
