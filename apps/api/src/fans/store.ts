import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type {
  OpenMark,
  PatronFlag,
  PatronSource,
  PatronStatus,
  PublishedUpdate,
} from '@deucex/agents';

// What apps/api's Fans service needs from the database, kept narrow (the
// same reasoning as packages/actions' EntriesDb/FansActionsDb): the webhook
// applier, checkout reconcile and attention pass are all tested against an
// in-memory implementation (service.test.ts), and this Supabase-backed one
// runs on the service role, since every write here is system-authored from
// Stripe's own state, never a player's.

export interface StoredProgramme {
  playerId: string;
  slug: string;
  stripeAccountId: string | null;
  kycStatus: 'not_started' | 'pending' | 'complete' | 'action_required';
  chargesEnabled: boolean;
  namesLineEnabled: boolean;
}

export interface StoredPlayer {
  id: string;
  name: string;
  tier: string | null;
  timezone: string;
  dob: string | null;
}

export interface StoredTier {
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

export interface StoredPatron {
  id: string;
  playerId: string;
  tierId: string;
  stripeSubscriptionId: string;
  name: string;
  email: string | null;
  status: PatronStatus;
  since: string;
  leftAt: string | null;
  leftReason: string | null;
  price: number;
  currency: string;
  opens: OpenMark[];
  flag: PatronFlag;
  note: string | null;
  namesOptIn: boolean;
  cardFailedAt: string | null;
  cardRetryAt: string | null;
  /** When billing was paused; the 90-day clock (owner decision, 25 Sep 2026). */
  pausedAt: string | null;
  source: PatronSource;
}

export type NewPatron = Omit<
  StoredPatron,
  'id' | 'leftAt' | 'leftReason' | 'cardFailedAt' | 'cardRetryAt' | 'pausedAt'
> & {
  stripeCustomerId: string | null;
  city: string | null;
  country: string | null;
};

export interface NewPatronEvent {
  playerId: string;
  patronId: string;
  kind: 'join' | 'upgrade' | 'downgrade' | 'leave' | 'card_failed' | 'card_recovered';
  at: string;
  attribution: string;
  fromTierId?: string | null;
  toTierId?: string | null;
  stripeEventId?: string | null;
}

export interface NewNotification {
  playerId: string;
  agent: 'fans' | 'stripe';
  category: 'for_you' | 'fyi';
  title: string;
  body: string;
  actionHref: string;
}

export interface PayoutRow {
  playerId: string;
  stripePayoutId: string;
  friday: string;
  gross: number;
  platformFee: number;
  platformFeeRate: 0.08 | 0.05;
  stripeFee: number;
  net: number;
  currency: string;
  status: 'scheduled' | 'paid' | 'held' | 'failed';
  paidAt: string | null;
}

export interface FansStore {
  /** Returns false when this Stripe event id was already applied (re-delivery); a previously failed one runs again. */
  recordWebhook(input: { id: string; type: string; account: string | null }): Promise<boolean>;
  markWebhookApplied(id: string, error: string | null): Promise<void>;

  getPlayer(playerId: string): Promise<StoredPlayer | null>;
  /** The player's own address, used as Reply-To on patron-facing notices. */
  getPlayerEmail(playerId: string): Promise<string | null>;
  getProgrammeByAccount(accountId: string): Promise<StoredProgramme | null>;
  getProgrammeBySlug(slug: string): Promise<StoredProgramme | null>;
  getProgramme(playerId: string): Promise<StoredProgramme | null>;
  listProgrammes(): Promise<StoredProgramme[]>;
  updateProgrammeStripeState(
    playerId: string,
    patch: {
      kycStatus?: StoredProgramme['kycStatus'];
      chargesEnabled?: boolean;
      payoutsEnabled?: boolean;
      bankLast4?: string | null;
      syncedAt: string;
    },
  ): Promise<void>;

  listTiers(playerId: string): Promise<StoredTier[]>;

  getPatronBySubscription(subscriptionId: string): Promise<StoredPatron | null>;
  getPatron(playerId: string, patronId: string): Promise<StoredPatron | null>;
  listPatrons(playerId: string): Promise<StoredPatron[]>;
  /** Inserts, or returns the existing row when the subscription was already recorded. */
  insertPatron(row: NewPatron): Promise<{ patron: StoredPatron; inserted: boolean }>;
  updatePatron(patronId: string, patch: Partial<StoredPatron>): Promise<void>;

  /** Ignores a duplicate (one join per patron; one event per Stripe event and kind). */
  insertEvent(event: NewPatronEvent): Promise<boolean>;
  insertNotification(n: NewNotification): Promise<void>;
  /** PRD-05's published updates (step 4.2). None exist yet, so attribution to an update never fires. */
  listPublishedUpdates(playerId: string): Promise<PublishedUpdate[]>;

  getPayout(stripePayoutId: string): Promise<PayoutRow | null>;
  upsertPayout(row: PayoutRow): Promise<void>;

  addToWaitlist(playerId: string, email: string): Promise<{ added: boolean; waiting: number }>;
  markWaitlistConverted(playerId: string, email: string, at: string): Promise<void>;

  /** runId is the fans/patron-note run that drafted the cached text, when it can still be found. */
  getDraft(
    patronId: string,
    kind: string,
  ): Promise<{ text: string; inputsHash: string; runId: string | null } | null>;
  saveDraft(input: {
    playerId: string;
    patronId: string;
    kind: string;
    text: string;
    inputsHash: string;
    runId: string;
  }): Promise<void>;
}

type PatronRow = Database['public']['Tables']['patrons']['Row'];

function toPatron(row: PatronRow): StoredPatron {
  return {
    id: row.id,
    playerId: row.player_id,
    tierId: row.tier_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    name: row.name,
    email: row.email,
    status: row.status as PatronStatus,
    since: row.since,
    leftAt: row.left_at,
    leftReason: row.left_reason,
    price: Number(row.price),
    currency: row.currency,
    opens: (Array.isArray(row.opens) ? row.opens : []) as OpenMark[],
    flag: row.flag as PatronFlag,
    note: row.note,
    namesOptIn: row.names_opt_in,
    cardFailedAt: row.card_failed_at,
    cardRetryAt: row.card_retry_at,
    pausedAt: row.paused_at,
    source: row.source as PatronSource,
  };
}

const PATCH_COLUMNS: Partial<Record<keyof StoredPatron, keyof PatronRow>> = {
  tierId: 'tier_id',
  status: 'status',
  leftAt: 'left_at',
  leftReason: 'left_reason',
  price: 'price',
  currency: 'currency',
  flag: 'flag',
  note: 'note',
  cardFailedAt: 'card_failed_at',
  cardRetryAt: 'card_retry_at',
  pausedAt: 'paused_at',
  opens: 'opens',
};

type ProgrammeRow = Database['public']['Tables']['patron_programmes']['Row'];

function toProgramme(row: ProgrammeRow): StoredProgramme {
  return {
    playerId: row.player_id,
    slug: row.slug,
    stripeAccountId: row.stripe_account_id,
    kycStatus: row.kyc_status as StoredProgramme['kycStatus'],
    chargesEnabled: row.charges_enabled,
    namesLineEnabled: row.names_line_enabled,
  };
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

export class SupabaseFansStore implements FansStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async recordWebhook(input: { id: string; type: string; account: string | null }) {
    const { error } = await this.db
      .from('stripe_webhook_events')
      .insert({ id: input.id, type: input.type, account: input.account });
    if (!isUniqueViolation(error)) {
      if (error) throw error;
      return true;
    }
    // Seen before: a duplicate only if it was applied. A delivery whose
    // apply threw is retried by Stripe and must run again.
    const existing = await this.db
      .from('stripe_webhook_events')
      .select('applied_at')
      .eq('id', input.id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    return existing.data?.applied_at == null;
  }

  async markWebhookApplied(id: string, error: string | null) {
    const res = await this.db
      .from('stripe_webhook_events')
      .update({ applied_at: error ? null : new Date().toISOString(), error })
      .eq('id', id);
    if (res.error) throw res.error;
  }

  async getPlayerEmail(playerId: string) {
    const { data, error } = await this.db
      .from('players')
      .select('email')
      .eq('id', playerId)
      .maybeSingle();
    if (error) throw error;
    return data?.email ?? null;
  }

  async getPlayer(playerId: string) {
    const { data, error } = await this.db
      .from('players')
      .select('id, name, tier, timezone, dob')
      .eq('id', playerId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  private async programmeWhere(col: 'stripe_account_id' | 'slug' | 'player_id', value: string) {
    const { data, error } = await this.db
      .from('patron_programmes')
      .select('*')
      .eq(col, value)
      .maybeSingle();
    if (error) throw error;
    return data ? toProgramme(data) : null;
  }

  getProgrammeByAccount(accountId: string) {
    return this.programmeWhere('stripe_account_id', accountId);
  }

  getProgrammeBySlug(slug: string) {
    return this.programmeWhere('slug', slug);
  }

  getProgramme(playerId: string) {
    return this.programmeWhere('player_id', playerId);
  }

  async listProgrammes() {
    const { data, error } = await this.db.from('patron_programmes').select('*');
    if (error) throw error;
    return (data ?? []).map(toProgramme);
  }

  async updateProgrammeStripeState(
    playerId: string,
    patch: Parameters<FansStore['updateProgrammeStripeState']>[1],
  ) {
    const { error } = await this.db
      .from('patron_programmes')
      .update({
        ...(patch.kycStatus !== undefined ? { kyc_status: patch.kycStatus } : {}),
        ...(patch.chargesEnabled !== undefined ? { charges_enabled: patch.chargesEnabled } : {}),
        ...(patch.payoutsEnabled !== undefined ? { payouts_enabled: patch.payoutsEnabled } : {}),
        ...(patch.bankLast4 !== undefined ? { bank_last4: patch.bankLast4 } : {}),
        stripe_synced_at: patch.syncedAt,
      })
      .eq('player_id', playerId);
    if (error) throw error;
  }

  async listTiers(playerId: string) {
    const { data, error } = await this.db
      .from('patron_tiers')
      .select('*')
      .eq('player_id', playerId)
      .order('position', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((t) => ({
      id: t.id,
      playerId: t.player_id,
      position: t.position,
      name: t.name,
      price: Number(t.price),
      currency: t.currency,
      perks: t.perks,
      stripeProductId: t.stripe_product_id,
      stripePriceId: t.stripe_price_id,
    }));
  }

  async getPatronBySubscription(subscriptionId: string) {
    const { data, error } = await this.db
      .from('patrons')
      .select('*')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();
    if (error) throw error;
    return data ? toPatron(data) : null;
  }

  async getPatron(playerId: string, patronId: string) {
    const { data, error } = await this.db
      .from('patrons')
      .select('*')
      .eq('player_id', playerId)
      .eq('id', patronId)
      .maybeSingle();
    if (error) throw error;
    return data ? toPatron(data) : null;
  }

  async listPatrons(playerId: string) {
    const { data, error } = await this.db.from('patrons').select('*').eq('player_id', playerId);
    if (error) throw error;
    return (data ?? []).map(toPatron);
  }

  async insertPatron(row: NewPatron) {
    const { data, error } = await this.db
      .from('patrons')
      .insert({
        player_id: row.playerId,
        tier_id: row.tierId,
        stripe_customer_id: row.stripeCustomerId,
        stripe_subscription_id: row.stripeSubscriptionId,
        name: row.name,
        email: row.email,
        city: row.city,
        country: row.country,
        source: row.source,
        status: row.status,
        since: row.since,
        price: row.price,
        currency: row.currency,
        opens: row.opens,
        flag: row.flag,
        note: row.note,
        names_opt_in: row.namesOptIn,
      })
      .select('*')
      .single();
    if (isUniqueViolation(error)) {
      const existing = await this.getPatronBySubscription(row.stripeSubscriptionId);
      if (!existing) throw error;
      return { patron: existing, inserted: false };
    }
    if (error) throw error;
    return { patron: toPatron(data), inserted: true };
  }

  async updatePatron(patronId: string, patch: Partial<StoredPatron>) {
    const row: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(PATCH_COLUMNS)) {
      const value = patch[key as keyof StoredPatron];
      if (value !== undefined) row[column] = value;
    }
    if (Object.keys(row).length === 0) return;
    const { error } = await this.db
      .from('patrons')
      .update(row as Database['public']['Tables']['patrons']['Update'])
      .eq('id', patronId);
    if (error) throw error;
  }

  // A partial unique index can't be an ON CONFLICT target through PostgREST
  // (the same limitation step 3.1 hit), so a duplicate is caught as a
  // unique-violation instead.
  async insertEvent(event: NewPatronEvent) {
    const { error } = await this.db.from('patron_events').insert({
      player_id: event.playerId,
      patron_id: event.patronId,
      kind: event.kind,
      at: event.at,
      attribution: event.attribution,
      from_tier_id: event.fromTierId ?? null,
      to_tier_id: event.toTierId ?? null,
      stripe_event_id: event.stripeEventId ?? null,
    });
    if (isUniqueViolation(error)) return false;
    if (error) throw error;
    return true;
  }

  async insertNotification(n: NewNotification) {
    const { error } = await this.db.from('notifications').insert({
      player_id: n.playerId,
      agent: n.agent,
      category: n.category,
      title: n.title,
      body: n.body,
      action_href: n.actionHref,
    });
    if (error) throw error;
  }

  // Step 4.2: the Content Agent's published updates, for P-7's attribution
  // sentences and the dashed update lines on the MRR chart.
  async listPublishedUpdates(playerId: string): Promise<PublishedUpdate[]> {
    const { data, error } = await this.db
      .from('patron_updates')
      .select('id, subject, sent_at')
      .eq('player_id', playerId)
      .eq('status', 'published')
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((u) => ({ id: u.id, title: u.subject, sentAt: u.sent_at! }));
  }

  async getPayout(stripePayoutId: string) {
    const { data, error } = await this.db
      .from('payouts')
      .select('*')
      .eq('stripe_payout_id', stripePayoutId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      playerId: data.player_id,
      stripePayoutId: data.stripe_payout_id,
      friday: data.friday,
      gross: Number(data.gross),
      platformFee: Number(data.platform_fee),
      platformFeeRate: Number(data.platform_fee_rate) as 0.08 | 0.05,
      stripeFee: Number(data.stripe_fee),
      net: Number(data.net),
      currency: data.currency,
      status: data.status as PayoutRow['status'],
      paidAt: data.paid_at,
    };
  }

  async upsertPayout(row: PayoutRow) {
    const { error } = await this.db.from('payouts').upsert(
      {
        player_id: row.playerId,
        stripe_payout_id: row.stripePayoutId,
        friday: row.friday,
        gross: row.gross,
        platform_fee: row.platformFee,
        platform_fee_rate: row.platformFeeRate,
        stripe_fee: row.stripeFee,
        net: row.net,
        currency: row.currency,
        status: row.status,
        paid_at: row.paidAt,
      },
      { onConflict: 'stripe_payout_id' },
    );
    if (error) throw error;
  }

  async addToWaitlist(playerId: string, email: string) {
    const { error } = await this.db.from('patron_waitlist').insert({ player_id: playerId, email });
    const added = !isUniqueViolation(error);
    if (error && added) throw error;
    const { count, error: countError } = await this.db
      .from('patron_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .is('invited_at', null)
      .is('converted_at', null);
    if (countError) throw countError;
    return { added, waiting: count ?? 0 };
  }

  async markWaitlistConverted(playerId: string, email: string, at: string) {
    const { error } = await this.db
      .from('patron_waitlist')
      .update({ converted_at: at })
      .eq('player_id', playerId)
      .ilike('email', email)
      .is('converted_at', null);
    if (error) throw error;
  }

  async getDraft(patronId: string, kind: string) {
    const { data, error } = await this.db
      .from('patron_note_drafts')
      .select('player_id, text, agent_run_inputs_hash')
      .eq('patron_id', patronId)
      .eq('kind', kind)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    // patron_note_drafts keeps the run's inputs hash, not its id, so the run
    // is found the way it was cached: same player, agent and inputs.
    const { data: run, error: runError } = await this.db
      .from('agent_runs')
      .select('id')
      .eq('player_id', data.player_id)
      .eq('agent_name', 'fans/patron-note')
      .eq('inputs_hash', data.agent_run_inputs_hash)
      .eq('status', 'succeeded')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (runError) throw runError;
    return { text: data.text, inputsHash: data.agent_run_inputs_hash, runId: run?.id ?? null };
  }

  async saveDraft(input: {
    playerId: string;
    patronId: string;
    kind: string;
    text: string;
    inputsHash: string;
  }) {
    const { error } = await this.db.from('patron_note_drafts').upsert(
      {
        player_id: input.playerId,
        patron_id: input.patronId,
        kind: input.kind,
        text: input.text,
        agent_run_inputs_hash: input.inputsHash,
      },
      { onConflict: 'patron_id,kind' },
    );
    if (error) throw error;
  }
}
