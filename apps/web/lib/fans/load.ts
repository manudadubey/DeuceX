import type { SupabaseClient } from '@supabase/supabase-js';
import { convertAtRate, getFxRates, type Database } from '@procircuit/db';
import {
  activePatrons,
  estimatePayout,
  mrrChange,
  mrrHistory,
  needsAttention,
  netChangeThisMonth,
  noteActionLabel,
  noteKindFor,
  openSummary,
  patronCapacity,
  patronDisplayName,
  platformFeeRate,
  tenureMonths,
  tenureSummary,
  twelveMonthRetention,
  type FansPlan,
  type OpenMark,
  type PatronFlag,
  type PatronNoteKind,
  type PatronRecord,
  type PatronSource,
  type PatronStatus,
} from '@procircuit/agents';

// Everything /fans shows, read through the player's own RLS-scoped session
// and computed live from the rows on every load (the Financial Agent's own
// "recompute on read" discipline, step 2.2): no KPI is cached anywhere.

export type TierColour = 'var(--chart-2)' | 'var(--chart-3)' | 'var(--chart-4)';
export const TIER_COLOURS: readonly TierColour[] = [
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
];

export interface FansTierView {
  id: string;
  position: number;
  name: string;
  price: number;
  currency: string;
  perks: string;
  colour: TierColour;
  activeCount: number;
  published: boolean;
}

export interface FansPatronView {
  id: string;
  name: string;
  displayName: string;
  firstName: string;
  tierId: string;
  tierName: string;
  colour: TierColour;
  status: PatronStatus;
  flag: PatronFlag;
  city: string | null;
  country: string | null;
  since: string;
  tenureMonths: number;
  leftAt: string | null;
  /** When billing was paused (step 4.1b); the 90-day clock. */
  pausedAt: string | null;
  note: string | null;
  opens: OpenMark[];
  opened: number;
  delivered: number;
  attention: boolean;
  noteKind: PatronNoteKind;
  actionLabel: string;
  hasEmail: boolean;
}

export interface FansEventView {
  id: string;
  kind: 'join' | 'upgrade' | 'downgrade' | 'leave' | 'card_failed' | 'card_recovered';
  at: string;
  title: string;
  attribution: string;
  patronDisplayName: string;
}

export interface FansPayoutView {
  id: string;
  friday: string;
  gross: number;
  platformFee: number;
  platformFeeRate: number;
  stripeFee: number;
  net: number;
  currency: string;
  status: 'scheduled' | 'paid' | 'held' | 'failed';
}

export interface FansWaitlistEntryView {
  id: string;
  email: string;
  joinedAt: string;
}

export interface FansProgrammeView {
  slug: string;
  kycStatus: 'not_started' | 'pending' | 'complete' | 'action_required';
  payoutsEnabled: boolean;
  bankLast4: string | null;
  namesLineEnabled: boolean;
  stripeSyncedAt: string | null;
}

export interface FansSnapshot {
  plan: FansPlan;
  homeCurrency: string;
  programme: FansProgrammeView | null;
  tiers: FansTierView[];
  patrons: FansPatronView[];
  events: FansEventView[];
  payouts: FansPayoutView[];
  waitlist: FansWaitlistEntryView[];
  kpi: {
    active: number;
    netChangeThisMonth: number;
    cap: number | null;
    full: boolean;
    retentionPercent: number | null;
    leftInLast90Days: number;
    averageTenureMonths: number | null;
    longest: { name: string; months: number } | null;
    feeRate: number | null;
    /** The scheduled payout Stripe has created, if any. */
    nextPayout: FansPayoutView | null;
    /** Before Stripe schedules one: PRD-04 section 7's formula over this month's active patrons. */
    payoutEstimate: { gross: number; platformFee: number; stripeFee: number; net: number } | null;
  };
  mrr: { current: number; change: number | null; history: Array<{ month: string; gross: number }> };
  chart: {
    days: Array<{ date: string; joins: string[]; leaves: string[] }>;
    joined: number;
    left: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function asOpens(value: unknown): OpenMark[] {
  return Array.isArray(value)
    ? (value.filter((v) => v === 1 || v === 0 || v === null) as OpenMark[])
    : [];
}

export async function loadFansSnapshot(
  supabase: SupabaseClient<Database>,
  input: { playerId: string; plan: FansPlan; homeCurrency: string; now?: Date },
): Promise<FansSnapshot> {
  const now = input.now ?? new Date();
  const since30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();

  const [programmeRes, tiersRes, patronsRes, eventsRes, payoutsRes, waitlistRes] =
    await Promise.all([
      supabase.from('patron_programmes').select('*').eq('player_id', input.playerId).maybeSingle(),
      supabase.from('patron_tiers').select('*').eq('player_id', input.playerId).order('position'),
      supabase.from('patrons').select('*').eq('player_id', input.playerId),
      supabase
        .from('patron_events')
        .select('*')
        .eq('player_id', input.playerId)
        .gte('at', since30)
        .order('at', { ascending: false }),
      supabase
        .from('payouts')
        .select('*')
        .eq('player_id', input.playerId)
        .order('friday', { ascending: false })
        .limit(8),
      supabase
        .from('patron_waitlist')
        .select('id, email, joined_at')
        .eq('player_id', input.playerId)
        .is('invited_at', null)
        .is('converted_at', null)
        .order('joined_at'),
    ]);
  for (const res of [programmeRes, tiersRes, patronsRes, eventsRes, payoutsRes, waitlistRes]) {
    if (res.error) throw res.error;
  }

  const tierRows = tiersRes.data ?? [];
  const patronRows = patronsRes.data ?? [];

  // M-CUR-1: tiers are priced in the home currency they were created in. If
  // the player has since changed home currency, figures convert at today's
  // ECB rate at read time; nothing converted is ever stored.
  const foreign = [
    ...new Set(patronRows.map((p) => p.currency).filter((c) => c !== input.homeCurrency)),
  ];
  let rates: Record<string, number> = {};
  if (foreign.length > 0) {
    const fx = await getFxRates(supabase, now.toISOString().slice(0, 10), [
      ...foreign,
      input.homeCurrency,
    ]);
    rates = Object.fromEntries(Object.entries(fx).map(([c, r]) => [c, r.rateToEur]));
  }
  const toHome = (amount: number, currency: string) => {
    try {
      return convertAtRate(amount, currency, input.homeCurrency, rates);
    } catch {
      return amount;
    }
  };

  const records: PatronRecord[] = patronRows.map((p) => ({
    id: p.id,
    name: p.name,
    tierId: p.tier_id,
    status: p.status as PatronStatus,
    since: p.since,
    leftAt: p.left_at,
    leftReason: p.left_reason,
    price: toHome(Number(p.price), p.currency),
    currency: input.homeCurrency,
    opens: asOpens(p.opens),
    cardFailedAt: p.card_failed_at,
    cardRetryAt: p.card_retry_at,
    source: p.source as PatronSource,
  }));

  const live = activePatrons(records);
  const tiers: FansTierView[] = tierRows.map((t, i) => ({
    id: t.id,
    position: t.position,
    name: t.name,
    price: Number(t.price),
    currency: t.currency,
    perks: t.perks,
    colour: TIER_COLOURS[i] ?? 'var(--chart-4)',
    activeCount: live.filter((p) => p.tierId === t.id).length,
    published: t.stripe_price_id !== null,
  }));
  const tierFor = (id: string) => tiers.find((t) => t.id === id);

  const patrons: FansPatronView[] = patronRows
    .map((row, i) => {
      const record = records[i]!;
      const flag = row.flag as PatronFlag;
      const tier = tierFor(row.tier_id);
      const { opened, delivered } = openSummary(record.opens);
      const kind = noteKindFor(record, flag);
      return {
        id: row.id,
        name: row.name,
        displayName: patronDisplayName(row.name),
        firstName: row.name.trim().split(/\s+/)[0] ?? row.name,
        tierId: row.tier_id,
        tierName: tier?.name ?? 'Patron',
        colour: tier?.colour ?? 'var(--chart-4)',
        status: record.status,
        flag,
        city: row.city,
        country: row.country,
        since: row.since,
        tenureMonths: tenureMonths(record, now),
        leftAt: row.left_at,
        pausedAt: row.paused_at,
        note: row.note,
        opens: record.opens,
        opened,
        delivered,
        attention: needsAttention(record, flag, now),
        noteKind: kind,
        actionLabel: noteActionLabel(kind),
        hasEmail: Boolean(row.email),
      };
    })
    .sort((a, b) => {
      // Live patrons first, newest first; departed at the end.
      if ((a.status === 'left') !== (b.status === 'left')) return a.status === 'left' ? 1 : -1;
      return b.since.localeCompare(a.since);
    });

  const patronById = new Map(patrons.map((p) => [p.id, p]));
  const events: FansEventView[] = (eventsRes.data ?? []).map((e) => {
    const patron = patronById.get(e.patron_id);
    const name = patron?.displayName ?? 'A patron';
    const tierName = tierFor(e.to_tier_id ?? e.from_tier_id ?? '')?.name ?? patron?.tierName ?? '';
    const title =
      e.kind === 'join'
        ? `${name} joined ${tierName}`
        : e.kind === 'upgrade'
          ? `${name} moved up to ${tierName}`
          : e.kind === 'downgrade'
            ? `${name} moved down to ${tierName}`
            : e.kind === 'leave'
              ? `${name} left ${tierName}`
              : e.kind === 'card_failed'
                ? `${name}'s card payment failed`
                : `${name}'s card payment went through`;
    return {
      id: e.id,
      kind: e.kind as FansEventView['kind'],
      at: e.at,
      title,
      attribution: e.attribution,
      patronDisplayName: name,
    };
  });

  const payouts: FansPayoutView[] = (payoutsRes.data ?? []).map((p) => ({
    id: p.id,
    friday: p.friday,
    gross: Number(p.gross),
    platformFee: Number(p.platform_fee),
    platformFeeRate: Number(p.platform_fee_rate),
    stripeFee: Number(p.stripe_fee),
    net: Number(p.net),
    currency: p.currency,
    status: p.status as FansPayoutView['status'],
  }));

  const history = mrrHistory(records, now);
  const current = history[history.length - 1]?.gross ?? 0;
  const previous = history[history.length - 2]?.gross ?? 0;
  const retention = twelveMonthRetention(records, now);
  const tenure = tenureSummary(records, now);
  const capacity = patronCapacity(input.plan, live.length);
  const feeRate = platformFeeRate(input.plan);
  const nextPayout = payouts.find((p) => p.status === 'scheduled') ?? null;

  // Last 30 days chart: one column per day, oldest first.
  const days: FansSnapshot['chart']['days'] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10);
    days.push({ date, joins: [], leaves: [] });
  }
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));
  for (const e of events) {
    const idx = dayIndex.get(e.at.slice(0, 10));
    if (idx === undefined) continue;
    if (e.kind === 'join') days[idx]!.joins.push(e.patronDisplayName);
    if (e.kind === 'upgrade') days[idx]!.joins.push(`${e.patronDisplayName} ↑`);
    if (e.kind === 'leave') days[idx]!.leaves.push(e.patronDisplayName);
  }

  const programme = programmeRes.data;
  return {
    plan: input.plan,
    homeCurrency: input.homeCurrency,
    programme: programme
      ? {
          slug: programme.slug,
          kycStatus: programme.kyc_status as FansProgrammeView['kycStatus'],
          payoutsEnabled: programme.payouts_enabled,
          bankLast4: programme.bank_last4,
          namesLineEnabled: programme.names_line_enabled,
          stripeSyncedAt: programme.stripe_synced_at,
        }
      : null,
    tiers,
    patrons,
    events,
    payouts,
    waitlist: (waitlistRes.data ?? []).map((w) => ({
      id: w.id,
      email: w.email,
      joinedAt: w.joined_at,
    })),
    kpi: {
      active: live.length,
      netChangeThisMonth: netChangeThisMonth(records, now),
      cap: capacity.cap,
      full: capacity.full,
      retentionPercent: retention.percent,
      leftInLast90Days: retention.leftInLast90Days,
      averageTenureMonths: tenure.averageMonths,
      longest: tenure.longest
        ? { ...tenure.longest, name: patronDisplayName(tenure.longest.name) }
        : null,
      feeRate,
      nextPayout,
      payoutEstimate:
        !nextPayout && feeRate !== null && live.length > 0
          ? estimatePayout(
              live.map((p) => p.price),
              feeRate,
            )
          : null,
    },
    mrr: { current, change: mrrChange(current, previous), history },
    chart: {
      days,
      joined: events.filter((e) => e.kind === 'join').length,
      left: events.filter((e) => e.kind === 'leave').length,
    },
  };
}

// ---------------------------------------------------------------------------
// The Free-tier locked view's sample data (M-TIER-1: "the real UI dimmed with
// sample data"), PRD-04's own twelve people, never mixed with real rows.
// ---------------------------------------------------------------------------

export function sampleFansSnapshot(homeCurrency: string, now = new Date()): FansSnapshot {
  const tiers: FansTierView[] = [
    {
      id: 's1',
      position: 1,
      name: 'Courtside',
      price: 29,
      currency: homeCurrency,
      perks: 'Every update, match results the same night, a name on your profile page.',
      colour: 'var(--chart-2)',
      activeCount: 8,
      published: true,
    },
    {
      id: 's2',
      position: 2,
      name: 'Locker Room',
      price: 65,
      currency: homeCurrency,
      perks:
        'Courtside plus practice notes, the tournament shortlist each week, and a monthly Q&A.',
      colour: 'var(--chart-3)',
      activeCount: 3,
      published: true,
    },
    {
      id: 's3',
      position: 3,
      name: 'Inside Track',
      price: 185,
      currency: homeCurrency,
      perks: 'Everything, a call after each tournament, and a seat at one event a season.',
      colour: 'var(--chart-4)',
      activeCount: 1,
      published: true,
    },
  ];
  const names: Array<[string, number, number, string]> = [
    ['Mira K.', 0, 0, 'Graz'],
    ['Daniel R.', 0, 0, 'Vienna'],
    ['Chris O.', 1, 4, 'Melbourne'],
    ['Jonas W.', 0, 6, 'Linz'],
    ['Elena S.', 0, 8, 'Zurich'],
    ['Petra H.', 0, 10, 'Vienna'],
    ['Hanna L.', 1, 13, 'Salzburg'],
    ['Luca M.', 0, 12, 'Bolzano'],
    ['Sophie T.', 0, 15, 'Vienna'],
    ['Tom B.', 0, 17, 'Innsbruck'],
    ['Markus F.', 1, 19, 'Vienna'],
    ['Gerhard B.', 2, 20, 'Vienna'],
  ];
  const patrons: FansPatronView[] = names.map(([name, tierIdx, months, city], i) => {
    const tier = tiers[tierIdx]!;
    const flag: PatronFlag = i === 8 ? 'quiet' : i === 9 ? 'card' : months === 0 ? 'new' : 'none';
    const kind = noteKindFor({ status: 'active' }, flag);
    return {
      id: `sample-${i}`,
      name,
      displayName: name,
      firstName: name.split(' ')[0]!,
      tierId: tier.id,
      tierName: tier.name,
      colour: tier.colour,
      status: flag === 'card' ? 'past_due' : 'active',
      flag,
      city,
      country: 'AT',
      since: new Date(now.getTime() - months * 30 * DAY_MS).toISOString(),
      tenureMonths: months,
      leftAt: null,
      pausedAt: null,
      note: null,
      opens: [1, 1, 1, 1, 1, 1],
      opened: 6,
      delivered: 6,
      attention: flag === 'quiet' || flag === 'card',
      noteKind: kind,
      actionLabel: noteActionLabel(kind),
      hasEmail: true,
    };
  });
  const days = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(now.getTime() - (29 - i) * DAY_MS).toISOString().slice(0, 10),
    joins: i === 22 ? ['Daniel R.'] : i === 23 ? ['Mira K.'] : [],
    leaves: i === 12 ? ['Anna P.'] : [],
  }));
  return {
    plan: 'free',
    homeCurrency,
    programme: null,
    tiers,
    patrons,
    events: [],
    payouts: [],
    waitlist: [],
    kpi: {
      active: 12,
      netChangeThisMonth: 2,
      cap: 50,
      full: false,
      retentionPercent: null,
      leftInLast90Days: 1,
      averageTenureMonths: 7.4,
      longest: { name: 'Gerhard B.', months: 20 },
      feeRate: 0.08,
      nextPayout: null,
      payoutEstimate: { gross: 612, platformFee: 48.96, stripeFee: 14.34, net: 548.7 },
    },
    mrr: {
      current: 612,
      change: 612 / 514 - 1,
      history: [380, 410, 455, 490, 514, 612].map((gross, i) => ({
        month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1))
          .toISOString()
          .slice(0, 7),
        gross,
      })),
    },
    chart: { days, joined: 2, left: 1 },
  };
}
