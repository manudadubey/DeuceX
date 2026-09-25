import { createHash } from 'node:crypto';
import {
  computePatronFlag,
  eventTitle,
  formatPatronMoney,
  fromMinorUnits,
  generatePatronNote,
  isActiveStatus,
  joinAttribution,
  leaveAttribution,
  leftWhenPhrase,
  noteKindFor,
  patronCapacity,
  patronFirstName,
  payoutBreakdownFromBalance,
  PATRON_NOTE_MODEL,
  PATRON_NOTE_PROMPT_VERSION,
  PATRON_NOTE_SCHEMA_VERSION,
  sourcePhrase,
  tenureMonths,
  tierMoveAttribution,
  weekdayName,
  type FansPlan,
  type PatronFlag,
  type PatronNoteInput,
  type PatronNoteKind,
  type PatronNoteModelClient,
  type PatronSource,
} from '@deucex/agents';
import { recordRun, type AgentRunsDb } from '@deucex/actions';
import { cancellationReason, PAUSED_MEMBERSHIP_DAYS } from '@deucex/shared';
import type { EmailClient } from '@deucex/actions/account';
import {
  endPausedMembership,
  type CheckoutSessionSummary,
  FansStripeClient,
  StripeWebhookEvent,
} from '@deucex/actions/fans';
import type { FansStore, StoredPatron, StoredProgramme, StoredTier } from './store';

// apps/api's half of Fans (PRD-04 section 3): applying Stripe's own events
// to the patron record within a minute (P-6), the checkout-return reconcile,
// the public page's read model, the waitlist, the daily attention pass and
// the on-tap note draft. Nothing in this file sends anything to a patron or
// moves money: those are packages/actions' gated functions. The only Stripe
// calls here are reads (retrieve a session, a subscription, an account, a
// payout's balance transactions), all through the actions module's client.

export interface FansReadDeps {
  store: FansStore;
  now?: () => Date;
}

export interface FansServiceDeps extends FansReadDeps {
  stripe: FansStripeClient;
}

const SOURCES: readonly PatronSource[] = ['profile', 'draw', 'direct', 'unknown'];

function planOf(tier: string | null): FansPlan {
  return tier === 'pro' || tier === 'elite' ? tier : 'free';
}

function tierById(tiers: readonly StoredTier[], id: string): StoredTier | undefined {
  return tiers.find((t) => t.id === id);
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/** PRD-04 section 4.1's card-failed meta line: "Card payment failed on 10 Sep · Stripe retries Fri". */
export function cardFailedNote(failedAt: string, retryAt: string | null): string {
  const retry = retryAt ? weekdayName(retryAt).slice(0, 3) : null;
  return `Card payment failed on ${shortDate(failedAt)}${retry ? ` · Stripe retries ${retry}` : ''}`;
}

export const QUIET_NOTE = "Hasn't opened the last three updates";

// ---------------------------------------------------------------------------
// Joins: shared by the checkout.session.completed webhook and the thank-you
// page's own reconcile, so whichever arrives first records the patron and
// the other is a no-op (stripe_subscription_id is unique; one join event
// per patron).
// ---------------------------------------------------------------------------

export interface JoinResult {
  patron: StoredPatron;
  tier: StoredTier;
  inserted: boolean;
}

export async function applyJoinFromSession(
  deps: FansServiceDeps,
  programme: StoredProgramme,
  session: CheckoutSessionSummary,
  stripeEventId: string | null,
): Promise<JoinResult | null> {
  if (session.status !== 'complete' || !session.subscriptionId || !programme.stripeAccountId) {
    return null;
  }
  // Stripe metadata keys keep their pre-rebrand `procircuit_` prefix, since live
  // Stripe objects already carry them.
  if (session.metadata.procircuit_player_id !== programme.playerId) return null;

  const subscription = await deps.stripe.retrieveSubscription({
    account: programme.stripeAccountId,
    id: session.subscriptionId,
  });
  const tiers = await deps.store.listTiers(programme.playerId);
  const tier =
    tiers.find((t) => t.stripeProductId && t.stripeProductId === subscription.productId) ??
    tierById(tiers, session.metadata.procircuit_tier_id ?? '');
  if (!tier) throw new Error(`No tier matches subscription ${subscription.id}`);

  const now = (deps.now ?? (() => new Date()))();
  const source = SOURCES.includes(session.metadata.source as PatronSource)
    ? (session.metadata.source as PatronSource)
    : 'unknown';
  const price =
    subscription.unitAmountMinor !== null
      ? fromMinorUnits(subscription.unitAmountMinor, subscription.currency)
      : tier.price;

  const { patron, inserted } = await deps.store.insertPatron({
    playerId: programme.playerId,
    tierId: tier.id,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customerId,
    name: session.name?.trim() || 'A patron',
    email: session.email,
    city: session.city,
    country: session.country,
    source,
    status: subscription.status === 'past_due' ? 'past_due' : 'active',
    since: session.createdAt,
    price,
    currency: subscription.currency,
    opens: [],
    flag: 'new',
    note: null,
    namesOptIn: session.metadata.names_opt_in === 'true',
  });
  if (!inserted) return { patron, tier, inserted };

  const updates = await deps.store.listPublishedUpdates(programme.playerId);
  const attribution = joinAttribution({ atIso: patron.since, source, updates });
  const recorded = await deps.store.insertEvent({
    playerId: programme.playerId,
    patronId: patron.id,
    kind: 'join',
    at: patron.since,
    attribution,
    toTierId: tier.id,
    stripeEventId,
  });
  if (recorded) {
    const active = (await deps.store.listPatrons(programme.playerId)).filter((p) =>
      isActiveStatus(p.status),
    ).length;
    const lead = attribution
      ? `${attribution.charAt(0).toUpperCase()}${attribution.slice(1)}. `
      : '';
    await deps.store.insertNotification({
      playerId: programme.playerId,
      agent: 'fans',
      category: 'fyi',
      title: eventTitle({ kind: 'join', patronName: patron.name, tierName: tier.name }),
      body: `${lead}${active === 1 ? '1 patron' : `${active} patrons`} now.`,
      actionHref: '/fans',
    });
  }
  if (session.email) {
    await deps.store.markWaitlistConverted(programme.playerId, session.email, now.toISOString());
  }
  return { patron, tier, inserted };
}

// ---------------------------------------------------------------------------
// The webhook applier (P-6): one handler per event type PRD-04 section 3 names.
// ---------------------------------------------------------------------------

function kycStatusFrom(state: {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: boolean;
}): StoredProgramme['kycStatus'] {
  if (state.chargesEnabled && state.payoutsEnabled && !state.requirementsDue) return 'complete';
  if (state.detailsSubmitted && state.requirementsDue) return 'action_required';
  return 'pending';
}

/** Re-reads the Connect account and stores its KYC state; used by account.updated and the "back from Stripe" refresh. */
export async function syncConnectAccount(
  deps: FansServiceDeps,
  programme: StoredProgramme,
): Promise<StoredProgramme['kycStatus']> {
  if (!programme.stripeAccountId) return programme.kycStatus;
  const state = await deps.stripe.retrieveAccount(programme.stripeAccountId);
  const kycStatus = kycStatusFrom(state);
  const now = (deps.now ?? (() => new Date()))();
  await deps.store.updateProgrammeStripeState(programme.playerId, {
    kycStatus,
    chargesEnabled: state.chargesEnabled,
    payoutsEnabled: state.payoutsEnabled,
    bankLast4: state.bankLast4,
    syncedAt: now.toISOString(),
  });
  if (kycStatus === 'action_required' && programme.kycStatus !== 'action_required') {
    await deps.store.insertNotification({
      playerId: programme.playerId,
      agent: 'stripe',
      category: 'for_you',
      title: 'Stripe needs something from you',
      body: 'Payouts are held until you finish the details Stripe asked for. It usually takes a few minutes.',
      actionHref: '/fans',
    });
  }
  return kycStatus;
}

function subscriptionIdOfInvoice(invoice: Record<string, unknown>): string | null {
  // API 2025-03-31 onward moved it under parent.subscription_details;
  // older payloads carry it at the top level.
  const parent = invoice.parent as { subscription_details?: { subscription?: unknown } } | null;
  const nested = parent?.subscription_details?.subscription;
  const top = invoice.subscription;
  const value = nested ?? top;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value)
    return String((value as { id: unknown }).id);
  return null;
}

function feeRateFrom(gross: number, platformFee: number, plan: FansPlan): 0.08 | 0.05 {
  if (gross > 0) {
    const ratio = platformFee / gross;
    return Math.abs(ratio - 0.05) < Math.abs(ratio - 0.08) ? 0.05 : 0.08;
  }
  return plan === 'elite' ? 0.05 : 0.08;
}

async function applyPayout(
  deps: FansServiceDeps,
  programme: StoredProgramme,
  payout: Record<string, unknown>,
): Promise<void> {
  const payoutId = String(payout.id);
  const existing = await deps.store.getPayout(payoutId);
  if (existing?.status === 'paid') return; // immutable (M-GATE-3); the table's own trigger also refuses

  const currency = String(payout.currency ?? 'aud').toUpperCase();
  const lines = await deps.stripe.listPayoutBalanceLines({
    account: programme.stripeAccountId!,
    payoutId,
  });
  const breakdown = payoutBreakdownFromBalance(
    lines.map((l) => ({
      type: l.type,
      amount: fromMinorUnits(l.amountMinor, currency),
      feeDetails: l.feeDetails.map((f) => ({
        type: f.type,
        amount: fromMinorUnits(f.amountMinor, currency),
      })),
    })),
  );
  const player = await deps.store.getPlayer(programme.playerId);
  const stripeStatus = String(payout.status ?? 'pending');
  const status =
    stripeStatus === 'paid'
      ? 'paid'
      : stripeStatus === 'failed' || stripeStatus === 'canceled'
        ? 'failed'
        : 'scheduled';
  const created = typeof payout.created === 'number' ? payout.created : Date.now() / 1000;
  const arrival = typeof payout.arrival_date === 'number' ? payout.arrival_date : null;
  await deps.store.upsertPayout({
    playerId: programme.playerId,
    stripePayoutId: payoutId,
    friday: new Date(created * 1000).toISOString().slice(0, 10),
    ...breakdown,
    platformFeeRate: feeRateFrom(
      breakdown.gross,
      breakdown.platformFee,
      planOf(player?.tier ?? null),
    ),
    currency,
    status,
    paidAt: status === 'paid' ? new Date((arrival ?? created) * 1000).toISOString() : null,
  });

  if (status === 'paid') {
    const rate = feeRateFrom(breakdown.gross, breakdown.platformFee, planOf(player?.tier ?? null));
    await deps.store.insertNotification({
      playerId: programme.playerId,
      agent: 'stripe',
      category: 'fyi',
      title: `Payout sent · ${formatPatronMoney(breakdown.net, currency)}`,
      body: `${formatPatronMoney(breakdown.gross, currency)} gross, minus the ${Math.round(rate * 100)}% platform fee (${formatPatronMoney(breakdown.platformFee, currency)}) and Stripe (${formatPatronMoney(breakdown.stripeFee, currency)}).`,
      actionHref: '/fans',
    });
  }
}

export type WebhookOutcome = 'applied' | 'duplicate' | 'ignored';

export async function applyStripeEvent(
  deps: FansServiceDeps,
  event: StripeWebhookEvent,
): Promise<WebhookOutcome> {
  const fresh = await deps.store.recordWebhook({
    id: event.id,
    type: event.type,
    account: event.account,
  });
  if (!fresh) return 'duplicate';

  try {
    const outcome = await applyEventBody(deps, event);
    await deps.store.markWebhookApplied(event.id, null);
    return outcome;
  } catch (err) {
    await deps.store.markWebhookApplied(event.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function applyEventBody(
  deps: FansServiceDeps,
  event: StripeWebhookEvent,
): Promise<WebhookOutcome> {
  if (!event.account) return 'ignored'; // only connected-account events belong to Fans
  const programme = await deps.store.getProgrammeByAccount(event.account);
  if (!programme) return 'ignored';
  const now = (deps.now ?? (() => new Date()))();
  const obj = event.object;

  switch (event.type) {
    case 'account.updated': {
      await syncConnectAccount(deps, programme);
      return 'applied';
    }

    case 'checkout.session.completed': {
      if (obj.mode !== 'subscription') return 'ignored';
      const session = await deps.stripe.retrieveCheckoutSession({
        account: event.account,
        id: String(obj.id),
      });
      await applyJoinFromSession(deps, programme, session, event.id);
      break;
    }

    case 'customer.subscription.updated': {
      const patron = await deps.store.getPatronBySubscription(String(obj.id));
      if (!patron) return 'ignored'; // the join itself arrives via checkout.session.completed
      const subscription = await deps.stripe.retrieveSubscription({
        account: event.account,
        id: patron.stripeSubscriptionId,
      });
      // Step 4.1b: keep the paused state in step with Stripe (P-18). The
      // gated pause/resume actions already set it directly; this covers a
      // change made in Stripe's own dashboard, and replays.
      if (subscription.paused && patron.status !== 'paused' && patron.status !== 'left') {
        await deps.store.updatePatron(patron.id, { status: 'paused', pausedAt: event.createdAt });
      } else if (!subscription.paused && patron.status === 'paused') {
        await deps.store.updatePatron(patron.id, { status: 'active', pausedAt: null });
      }
      const tiers = await deps.store.listTiers(programme.playerId);
      const newTier = tiers.find((t) => t.stripeProductId === subscription.productId);
      const oldTier = tierById(tiers, patron.tierId);
      if (newTier && oldTier && newTier.id !== patron.tierId) {
        const kind = newTier.position > oldTier.position ? 'upgrade' : 'downgrade';
        const price =
          subscription.unitAmountMinor !== null
            ? fromMinorUnits(subscription.unitAmountMinor, subscription.currency)
            : newTier.price;
        await deps.store.updatePatron(patron.id, {
          tierId: newTier.id,
          price,
          currency: subscription.currency,
        });
        const updates = await deps.store.listPublishedUpdates(programme.playerId);
        await deps.store.insertEvent({
          playerId: programme.playerId,
          patronId: patron.id,
          kind,
          at: event.createdAt,
          attribution: tierMoveAttribution({ atIso: event.createdAt, updates }),
          fromTierId: oldTier.id,
          toTierId: newTier.id,
          stripeEventId: event.id,
        });
        if (kind === 'upgrade') {
          await deps.store.insertNotification({
            playerId: programme.playerId,
            agent: 'fans',
            category: 'fyi',
            title: eventTitle({ kind, patronName: patron.name, tierName: newTier.name }),
            body: `From ${oldTier.name}.`,
            actionHref: '/fans',
          });
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const patron = await deps.store.getPatronBySubscription(String(obj.id));
      if (!patron || patron.status === 'left') return 'ignored';
      const subscription = await deps.stripe.retrieveSubscription({
        account: event.account,
        id: patron.stripeSubscriptionId,
      });
      const leftAt = subscription.endedAt ?? subscription.canceledAt ?? event.createdAt;
      const reason = cancellationReason(
        subscription.cancellationComment,
        subscription.cancellationFeedback,
      );
      await deps.store.updatePatron(patron.id, {
        status: 'left',
        leftAt,
        leftReason: reason,
        flag: 'none',
        note: null,
      });
      const tier = tierById(await deps.store.listTiers(programme.playerId), patron.tierId);
      const months = tenureMonths({ since: patron.since, leftAt }, now);
      await deps.store.insertEvent({
        playerId: programme.playerId,
        patronId: patron.id,
        kind: 'leave',
        at: leftAt,
        attribution: leaveAttribution({
          tenureMonths: months,
          opens: patron.opens,
          lastOpenedAt: null,
          reason,
        }),
        fromTierId: patron.tierId,
        stripeEventId: event.id,
      });
      await deps.store.insertNotification({
        playerId: programme.playerId,
        agent: 'fans',
        category: 'fyi',
        title: eventTitle({
          kind: 'leave',
          patronName: patron.name,
          tierName: tier?.name ?? 'your page',
        }),
        body: `${months === 1 ? '1 month' : `${months} months`}. A thank-you note is still worth sending.`,
        actionHref: '/fans',
      });
      break;
    }

    case 'invoice.payment_failed': {
      const subscriptionId = subscriptionIdOfInvoice(obj);
      const patron = subscriptionId
        ? await deps.store.getPatronBySubscription(subscriptionId)
        : null;
      if (!patron || patron.status === 'left') return 'ignored';
      const failedAt = event.createdAt;
      const retryAt =
        typeof obj.next_payment_attempt === 'number'
          ? new Date(obj.next_payment_attempt * 1000).toISOString()
          : null;
      await deps.store.updatePatron(patron.id, {
        status: 'past_due',
        cardFailedAt: failedAt,
        cardRetryAt: retryAt,
        flag: 'card',
        note: cardFailedNote(failedAt, retryAt),
      });
      const recorded = await deps.store.insertEvent({
        playerId: programme.playerId,
        patronId: patron.id,
        kind: 'card_failed',
        at: failedAt,
        attribution: retryAt ? `Stripe retries ${weekdayName(retryAt)}` : '',
        stripeEventId: event.id,
      });
      if (recorded) {
        await deps.store.insertNotification({
          playerId: programme.playerId,
          agent: 'fans',
          category: 'for_you',
          title: eventTitle({ kind: 'card_failed', patronName: patron.name, tierName: '' }),
          body: `${retryAt ? `Stripe retries ${weekdayName(retryAt)}.` : 'Stripe will retry.'} A gentle nudge is drafted if you want it.`,
          actionHref: '/fans',
        });
      }
      break;
    }

    case 'invoice.paid': {
      const subscriptionId = subscriptionIdOfInvoice(obj);
      const patron = subscriptionId
        ? await deps.store.getPatronBySubscription(subscriptionId)
        : null;
      if (!patron || patron.status === 'left' || !patron.cardFailedAt) return 'ignored';
      const recovered = {
        ...patron,
        status: 'active' as const,
        cardFailedAt: null,
        cardRetryAt: null,
      };
      await deps.store.updatePatron(patron.id, {
        status: 'active',
        cardFailedAt: null,
        cardRetryAt: null,
        flag: computePatronFlag(recovered, now),
        note: null,
      });
      await deps.store.insertEvent({
        playerId: programme.playerId,
        patronId: patron.id,
        kind: 'card_recovered',
        at: event.createdAt,
        attribution: '',
        stripeEventId: event.id,
      });
      break;
    }

    case 'payout.created':
    case 'payout.updated':
    case 'payout.paid':
    case 'payout.failed':
    case 'payout.canceled': {
      await applyPayout(deps, programme, obj);
      break;
    }

    default:
      return 'ignored';
  }

  await deps.store.updateProgrammeStripeState(programme.playerId, { syncedAt: now.toISOString() });
  return 'applied';
}

// ---------------------------------------------------------------------------
// The public page's read model (/p/<slug>, PRD-04 section 4.3, P-2, P-19).
// Unauthenticated, so this is a hand-built DTO: tier names, prices, perks
// and opted-in first names only. Never a surname, email, count by tier or
// any of the player's finances (section 10's Public page scope).
// ---------------------------------------------------------------------------

export interface PublicPatronPage {
  slug: string;
  playerName: string;
  /** 'open': tiers on sale. 'full': Pro cap reached, waitlist instead (M-TIER-3). 'closed': no tiers shown (Free, KYC incomplete, no tiers, or an under-18 page). */
  state: 'open' | 'full' | 'closed';
  tiers: Array<{ id: string; name: string; price: number; currency: string; perks: string }>;
  thanksLine: string | null;
  /** Worksheet 6's checkout disclosure: the platform fee comes out of the tier price, never on top of it. */
  feePercent: number | null;
  /** Step 4.2 (PRD-05 C-13): "Latest for patrons", the first paragraph of the latest published update, when allowed. */
  latestUpdate?: { text: string; sentAt: string } | null;
}

function isMinor(dob: string | null, now: Date): boolean {
  if (!dob) return false;
  const eighteen = new Date(dob);
  eighteen.setUTCFullYear(eighteen.getUTCFullYear() + 18);
  return eighteen > now;
}

/** P-AC-14: "Thanks to Mira, Daniel, Chris, Jonas and 8 more." */
export function thanksLine(active: readonly StoredPatron[]): string | null {
  const named = active.filter((p) => p.namesOptIn).map((p) => patronFirstName(p.name));
  if (named.length === 0) return null;
  const shown = named.slice(0, 4);
  const rest = active.length - shown.length;
  if (rest <= 0) {
    return shown.length === 1
      ? `Thanks to ${shown[0]}.`
      : `Thanks to ${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}.`;
  }
  return `Thanks to ${shown.join(', ')} and ${rest} more.`;
}

export async function loadPublicPage(
  deps: FansReadDeps,
  slug: string,
): Promise<PublicPatronPage | null> {
  const programme = await deps.store.getProgrammeBySlug(slug);
  if (!programme) return null;
  const player = await deps.store.getPlayer(programme.playerId);
  if (!player) return null;
  const now = (deps.now ?? (() => new Date()))();

  const plan = planOf(player.tier);
  const tiers = (await deps.store.listTiers(programme.playerId)).filter((t) => t.stripePriceId);
  const patrons = await deps.store.listPatrons(programme.playerId);
  const active = patrons.filter((p) => isActiveStatus(p.status));

  // M-ID-3: an under-18 player's public page is off by default. There is no
  // guardian switch to turn it back on yet (PRD-11's public-profile editor),
  // so for now it stays off.
  const sellable =
    plan !== 'free' &&
    programme.kycStatus === 'complete' &&
    programme.chargesEnabled &&
    tiers.length > 0 &&
    !isMinor(player.dob, now);

  return {
    slug,
    playerName: player.name,
    state: !sellable ? 'closed' : patronCapacity(plan, active.length).full ? 'full' : 'open',
    tiers: sellable
      ? tiers.map((t) => ({
          id: t.id,
          name: t.name,
          price: t.price,
          currency: t.currency,
          perks: t.perks,
        }))
      : [],
    thanksLine: sellable && programme.namesLineEnabled ? thanksLine(active) : null,
    feePercent: plan === 'elite' ? 5 : plan === 'pro' ? 8 : null,
  };
}

/** P-3: the waitlist form. Never an error for a duplicate email; one For-you notification when the first person joins it. */
export async function joinWaitlist(
  deps: FansReadDeps,
  slug: string,
  email: string,
): Promise<{ ok: boolean }> {
  const programme = await deps.store.getProgrammeBySlug(slug);
  if (!programme) return { ok: false };
  const { added, waiting } = await deps.store.addToWaitlist(
    programme.playerId,
    email.trim().toLowerCase(),
  );
  if (added && waiting === 1) {
    await deps.store.insertNotification({
      playerId: programme.playerId,
      agent: 'fans',
      category: 'for_you',
      title: 'Your page is full · 1 on the waitlist',
      body: 'Someone asked to back you while your page is at the Pro limit of 50. Invite them from Fans when a place opens, or move to Elite for no limit.',
      actionHref: '/fans',
    });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The daily attention pass (P-9): 06:00 local, recompute every flag.
// ---------------------------------------------------------------------------

export function attentionNote(patron: StoredPatron, flag: PatronFlag): string | null {
  if (flag === 'card' && patron.cardFailedAt)
    return cardFailedNote(patron.cardFailedAt, patron.cardRetryAt);
  if (flag === 'quiet') return QUIET_NOTE;
  if (flag === 'new') {
    const phrase = sourcePhrase(patron.source);
    return phrase ? `New · ${phrase}` : 'New';
  }
  return null;
}

export async function runAttentionPass(
  deps: FansReadDeps,
  playerId: string,
): Promise<{ changed: number }> {
  const now = (deps.now ?? (() => new Date()))();
  let changed = 0;
  for (const patron of await deps.store.listPatrons(playerId)) {
    const flag = computePatronFlag(patron, now);
    const note = patron.status === 'left' ? patron.note : attentionNote(patron, flag);
    if (flag !== patron.flag || note !== patron.note) {
      await deps.store.updatePatron(patron.id, { flag, note });
      changed++;
    }
  }
  return { changed };
}

function localHour(now: Date, timezone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  })
    .formatToParts(now)
    .find((p) => p.type === 'hour')?.value;
  return Number(hour ?? '0') % 24;
}

export const ATTENTION_PASS_LOCAL_HOUR = 6;

export async function runAttentionPassTick(deps: FansReadDeps): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  let ran = 0;
  for (const programme of await deps.store.listProgrammes()) {
    const player = await deps.store.getPlayer(programme.playerId);
    if (!player || localHour(now, player.timezone || 'UTC') !== ATTENTION_PASS_LOCAL_HOUR) continue;
    await runAttentionPass(deps, programme.playerId);
    ran++;
  }
  return ran;
}

// ---------------------------------------------------------------------------
// Step 4.1b follow-up: end memberships paused for 90 days (owner decision,
// 25 September 2026). Runs on the same hourly tick for every programme; it
// only ever acts on patrons past the 90-day mark, so it is idempotent. A
// Stripe failure leaves that patron paused for the next tick to retry.
// ---------------------------------------------------------------------------

export interface PausedExpiryDeps extends FansServiceDeps {
  email: EmailClient;
  appBaseUrl: string;
}

export const PAUSED_EXPIRY_ENDED_REASON = 'Ended after 90 days paused';

export async function runPausedExpirySweep(
  deps: PausedExpiryDeps,
): Promise<{ ended: number; failed: number }> {
  const now = (deps.now ?? (() => new Date()))();
  const cutoff = now.getTime() - PAUSED_MEMBERSHIP_DAYS * 24 * 60 * 60 * 1000;
  let ended = 0;
  let failed = 0;
  for (const programme of await deps.store.listProgrammes()) {
    if (!programme.stripeAccountId) continue;
    const due = (await deps.store.listPatrons(programme.playerId)).filter(
      (p) =>
        p.status === 'paused' && p.pausedAt !== null && new Date(p.pausedAt).getTime() <= cutoff,
    );
    if (due.length === 0) continue;
    const player = await deps.store.getPlayer(programme.playerId);
    const playerEmail = await deps.store.getPlayerEmail(programme.playerId);
    if (!player || !playerEmail) continue;
    const tiers = await deps.store.listTiers(programme.playerId);
    for (const patron of due) {
      try {
        await endPausedMembership(deps.stripe, deps.email, {
          account: programme.stripeAccountId,
          subscriptionId: patron.stripeSubscriptionId,
          patronEmail: patron.email,
          playerName: player.name,
          playerEmail,
          pageUrl: `${deps.appBaseUrl}/p/${programme.slug}`,
        });
      } catch {
        failed++;
        continue;
      }
      const leftAt = now.toISOString();
      await deps.store.updatePatron(patron.id, {
        status: 'left',
        leftAt,
        leftReason: PAUSED_EXPIRY_ENDED_REASON,
        pausedAt: null,
        flag: 'none',
        note: null,
      });
      const months = tenureMonths({ since: patron.since, leftAt }, now);
      const tier = tierById(tiers, patron.tierId);
      await deps.store.insertEvent({
        playerId: programme.playerId,
        patronId: patron.id,
        kind: 'leave',
        at: leftAt,
        attribution: `${months === 1 ? '1 month' : `${months} months`}. ${PAUSED_EXPIRY_ENDED_REASON}.`,
        fromTierId: patron.tierId,
      });
      await deps.store.insertNotification({
        playerId: programme.playerId,
        agent: 'fans',
        category: 'fyi',
        title: eventTitle({
          kind: 'leave',
          patronName: patron.name,
          tierName: tier?.name ?? 'your page',
        }),
        body: `Their membership had been paused for ${PAUSED_MEMBERSHIP_DAYS} days, so it has ended. Nothing more is charged.`,
        actionHref: '/fans',
      });
      ended++;
    }
  }
  return { ended, failed };
}

// ---------------------------------------------------------------------------
// The on-tap note draft (P-10). Generated when the player opens the
// composer, cached per patron and kind, never generated in bulk (PRD-04
// section 3 Cost).
// ---------------------------------------------------------------------------

export interface DraftDeps extends FansReadDeps {
  noteClient: PatronNoteModelClient;
  agentRuns: AgentRunsDb;
}

export interface DraftResult {
  kind: PatronNoteKind;
  /** Null when the agent couldn't draft this one; the UI then opens an empty textarea. */
  text: string | null;
}

export async function draftPatronNote(
  deps: DraftDeps,
  playerId: string,
  patronId: string,
): Promise<DraftResult | null> {
  const patron = await deps.store.getPatron(playerId, patronId);
  const player = await deps.store.getPlayer(playerId);
  if (!patron || !player) return null;
  const now = (deps.now ?? (() => new Date()))();
  const kind = noteKindFor(patron, patron.flag);
  const tier = tierById(await deps.store.listTiers(playerId), patron.tierId);
  const others = (await deps.store.listPatrons(playerId))
    .filter((p) => p.id !== patron.id)
    .map((p) => patronFirstName(p.name));

  const input: PatronNoteInput = {
    kind,
    playerFirstName: patronFirstName(player.name),
    patronFirstName: patronFirstName(patron.name),
    tierName: tier?.name ?? 'patron',
    tenureMonths: tenureMonths(patron, now),
    ...(patron.leftAt ? { leftWhen: leftWhenPhrase(patron.leftAt, now) } : {}),
    ...(patron.cardRetryAt ? { retryDay: weekdayName(patron.cardRetryAt) } : {}),
    otherPatronFirstNames: others,
  };
  const inputsHash = createHash('sha256')
    .update(JSON.stringify({ ...input, otherPatronFirstNames: [...others].sort() }))
    .digest('hex');

  const cached = await deps.store.getDraft(patron.id, kind);
  if (cached && cached.inputsHash === inputsHash) return { kind, text: cached.text };

  try {
    let text = '';
    await recordRun(
      deps.agentRuns,
      {
        agentName: 'fans/patron-note',
        playerId,
        triggerType: 'manual',
        inputsHash,
        model: PATRON_NOTE_MODEL,
        promptVersion: PATRON_NOTE_PROMPT_VERSION,
        schemaVersion: PATRON_NOTE_SCHEMA_VERSION,
      },
      async () => {
        const result = await generatePatronNote(deps.noteClient, input);
        text = result.text;
        return { output: { kind, text }, usage: result.usage };
      },
    );
    await deps.store.saveDraft({ playerId, patronId: patron.id, kind, text, inputsHash });
    return { kind, text };
  } catch {
    return { kind, text: null };
  }
}
