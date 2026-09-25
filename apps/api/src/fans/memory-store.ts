import type { PublishedUpdate } from '@procircuit/agents';
import type {
  FansStore,
  NewNotification,
  NewPatron,
  NewPatronEvent,
  PayoutRow,
  StoredPatron,
  StoredPlayer,
  StoredProgramme,
  StoredTier,
} from './store';

// An in-memory FansStore for service.test.ts, with the same uniqueness rules
// the migration enforces (one patron per subscription, one join per patron,
// one event per Stripe event and kind, one waitlist row per email, a paid
// payout immutable), so the tests exercise idempotency rather than assume it.
export class MemoryFansStore implements FansStore {
  players = new Map<string, StoredPlayer>();
  programmes = new Map<
    string,
    StoredProgramme & { payoutsEnabled?: boolean; bankLast4?: string | null; syncedAt?: string }
  >();
  tiers: StoredTier[] = [];
  patrons: StoredPatron[] = [];
  events: NewPatronEvent[] = [];
  notifications: NewNotification[] = [];
  payouts = new Map<string, PayoutRow>();
  waitlist: Array<{
    playerId: string;
    email: string;
    invitedAt: string | null;
    convertedAt: string | null;
  }> = [];
  drafts = new Map<string, { text: string; inputsHash: string }>();
  webhooks = new Map<string, { appliedAt: string | null; error: string | null }>();
  updates: PublishedUpdate[] = [];
  private nextId = 1;

  async recordWebhook(input: { id: string }) {
    const seen = this.webhooks.get(input.id);
    if (seen) return seen.appliedAt === null;
    this.webhooks.set(input.id, { appliedAt: null, error: null });
    return true;
  }

  async markWebhookApplied(id: string, error: string | null) {
    this.webhooks.set(id, { appliedAt: error ? null : new Date().toISOString(), error });
  }

  playerEmails = new Map<string, string>();

  async getPlayerEmail(playerId: string) {
    return this.playerEmails.get(playerId) ?? null;
  }

  async getPlayer(playerId: string) {
    return this.players.get(playerId) ?? null;
  }

  async getProgrammeByAccount(accountId: string) {
    return [...this.programmes.values()].find((p) => p.stripeAccountId === accountId) ?? null;
  }

  async getProgrammeBySlug(slug: string) {
    return [...this.programmes.values()].find((p) => p.slug === slug) ?? null;
  }

  async getProgramme(playerId: string) {
    return this.programmes.get(playerId) ?? null;
  }

  async listProgrammes() {
    return [...this.programmes.values()];
  }

  async updateProgrammeStripeState(
    playerId: string,
    patch: Parameters<FansStore['updateProgrammeStripeState']>[1],
  ) {
    const current = this.programmes.get(playerId);
    if (!current) return;
    this.programmes.set(playerId, {
      ...current,
      ...(patch.kycStatus !== undefined ? { kycStatus: patch.kycStatus } : {}),
      ...(patch.chargesEnabled !== undefined ? { chargesEnabled: patch.chargesEnabled } : {}),
      ...(patch.payoutsEnabled !== undefined ? { payoutsEnabled: patch.payoutsEnabled } : {}),
      ...(patch.bankLast4 !== undefined ? { bankLast4: patch.bankLast4 } : {}),
      syncedAt: patch.syncedAt,
    });
  }

  async listTiers(playerId: string) {
    return this.tiers
      .filter((t) => t.playerId === playerId)
      .sort((a, b) => a.position - b.position);
  }

  async getPatronBySubscription(subscriptionId: string) {
    return this.patrons.find((p) => p.stripeSubscriptionId === subscriptionId) ?? null;
  }

  async getPatron(playerId: string, patronId: string) {
    return this.patrons.find((p) => p.playerId === playerId && p.id === patronId) ?? null;
  }

  async listPatrons(playerId: string) {
    return this.patrons.filter((p) => p.playerId === playerId);
  }

  async insertPatron(row: NewPatron) {
    const existing = await this.getPatronBySubscription(row.stripeSubscriptionId);
    if (existing) return { patron: existing, inserted: false };
    const patron: StoredPatron = {
      playerId: row.playerId,
      tierId: row.tierId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      name: row.name,
      email: row.email,
      status: row.status,
      since: row.since,
      price: row.price,
      currency: row.currency,
      opens: row.opens,
      flag: row.flag,
      note: row.note,
      namesOptIn: row.namesOptIn,
      source: row.source,
      id: `patron-${this.nextId++}`,
      leftAt: null,
      leftReason: null,
      cardFailedAt: null,
      cardRetryAt: null,
      pausedAt: null,
    };
    this.patrons.push(patron);
    return { patron, inserted: true };
  }

  async updatePatron(patronId: string, patch: Partial<StoredPatron>) {
    const index = this.patrons.findIndex((p) => p.id === patronId);
    if (index >= 0) this.patrons[index] = { ...this.patrons[index]!, ...patch };
  }

  async insertEvent(event: NewPatronEvent) {
    const duplicate = this.events.some(
      (e) =>
        (event.kind === 'join' && e.kind === 'join' && e.patronId === event.patronId) ||
        (event.stripeEventId != null &&
          e.stripeEventId === event.stripeEventId &&
          e.kind === event.kind),
    );
    if (duplicate) return false;
    this.events.push(event);
    return true;
  }

  async insertNotification(n: NewNotification) {
    this.notifications.push(n);
  }

  async listPublishedUpdates() {
    return this.updates;
  }

  async getPayout(id: string) {
    return this.payouts.get(id) ?? null;
  }

  async upsertPayout(row: PayoutRow) {
    if (this.payouts.get(row.stripePayoutId)?.status === 'paid') {
      throw new Error('payouts: a paid payout cannot be changed or removed');
    }
    if (Math.abs(row.net - (row.gross - row.platformFee - row.stripeFee)) > 0.001) {
      throw new Error('payouts_net_check');
    }
    this.payouts.set(row.stripePayoutId, row);
  }

  async addToWaitlist(playerId: string, email: string) {
    const exists = this.waitlist.some(
      (w) => w.playerId === playerId && w.email.toLowerCase() === email.toLowerCase(),
    );
    if (!exists) this.waitlist.push({ playerId, email, invitedAt: null, convertedAt: null });
    const waiting = this.waitlist.filter(
      (w) => w.playerId === playerId && !w.invitedAt && !w.convertedAt,
    ).length;
    return { added: !exists, waiting };
  }

  async markWaitlistConverted(playerId: string, email: string, at: string) {
    for (const w of this.waitlist) {
      if (
        w.playerId === playerId &&
        w.email.toLowerCase() === email.toLowerCase() &&
        !w.convertedAt
      ) {
        w.convertedAt = at;
      }
    }
  }

  async getDraft(patronId: string, kind: string) {
    return this.drafts.get(`${patronId}:${kind}`) ?? null;
  }

  async saveDraft(input: { patronId: string; kind: string; text: string; inputsHash: string }) {
    this.drafts.set(`${input.patronId}:${input.kind}`, {
      text: input.text,
      inputsHash: input.inputsHash,
    });
  }
}
