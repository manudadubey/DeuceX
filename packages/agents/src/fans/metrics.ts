import type { PatronRecord, PatronStatus, FansPlan } from './types';

// PRD-04 section 7's business rules, all deterministic. Every figure on the
// Fans KPI row, the MRR chart and the Financial Agent's patron income line is
// computed here from patron records, never cached (same "recompute live on
// every read" discipline as the Financial Agent's own engine, step 2.2).

const DAY_MS = 24 * 60 * 60 * 1000;

/** The Pro cap (M-TIER-3). Elite has none; Free has no tiers at all. */
export const PRO_PATRON_CAP = 50;

/** Decisions worksheet 5: 8 percent on Pro, 5 percent on Elite, taken on the gross (worksheet 6). */
export function platformFeeRate(plan: FansPlan): 0.08 | 0.05 | null {
  if (plan === 'pro') return 0.08;
  if (plan === 'elite') return 0.05;
  return null;
}

/** PRD-04 section 7: "Active means status active or pastDue." */
export function isActiveStatus(status: PatronStatus): boolean {
  return status === 'active' || status === 'past_due';
}

export function activePatrons<T extends Pick<PatronRecord, 'status'>>(patrons: readonly T[]): T[] {
  return patrons.filter((p) => isActiveStatus(p.status));
}

export interface CapacityState {
  cap: number | null;
  activeCount: number;
  full: boolean;
}

/** P-3 / M-TIER-3: a Pro account accepts checkout while active patrons are fewer than 50. */
export function patronCapacity(plan: FansPlan, activeCount: number): CapacityState {
  const cap = plan === 'pro' ? PRO_PATRON_CAP : null;
  return { cap, activeCount, full: cap !== null && activeCount >= cap };
}

/** Gross MRR = sum of what each active patron pays (grandfathered prices, not the tier's current one). */
export function grossMrr(patrons: readonly Pick<PatronRecord, 'status' | 'price'>[]): number {
  return roundCents(activePatrons(patrons).reduce((sum, p) => sum + p.price, 0));
}

/** PRD-04 section 7: MRR this month / MRR last month - 1. Null when last month was zero. */
export function mrrChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return current / previous - 1;
}

/** PRD-04 section 7: weekly patron income for PRD-03 = MRR x 12 / 52. */
export function weeklyPatronIncome(mrr: number): number {
  return (mrr * 12) / 52;
}

/** Whole months between two instants (a patron who joined today has 0). */
export function wholeMonthsBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso);
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** Tenure in whole months, to the day they left for a departed patron. */
export function tenureMonths(patron: Pick<PatronRecord, 'since' | 'leftAt'>, now: Date): number {
  return wholeMonthsBetween(patron.since, patron.leftAt ? new Date(patron.leftAt) : now);
}

export interface TenureSummary {
  averageMonths: number | null;
  longest: { name: string; months: number } | null;
}

/** P-15: mean whole-month tenure of active patrons, and the longest-serving one. */
export function tenureSummary(
  patrons: readonly Pick<PatronRecord, 'status' | 'since' | 'leftAt' | 'name'>[],
  now: Date,
): TenureSummary {
  const live = activePatrons(patrons);
  if (live.length === 0) return { averageMonths: null, longest: null };
  let total = 0;
  let longest = { name: live[0]!.name, months: tenureMonths(live[0]!, now) };
  for (const p of live) {
    const months = tenureMonths(p, now);
    total += months;
    if (months > longest.months) longest = { name: p.name, months };
  }
  return { averageMonths: total / live.length, longest };
}

export interface RetentionSummary {
  /** Whole percentage, or null when nobody was a patron twelve months ago. */
  percent: number | null;
  leftInLast90Days: number;
}

/**
 * PRD-04 section 7: patrons active twelve months ago who are still active,
 * divided by patrons active twelve months ago. Null until the programme is a
 * year old: the prototype's "92%" was illustrative (register B4) and a new
 * programme has no honest figure to show.
 */
export function twelveMonthRetention(
  patrons: readonly Pick<PatronRecord, 'status' | 'since' | 'leftAt'>[],
  now: Date,
): RetentionSummary {
  const yearAgo = new Date(now);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const cohort = patrons.filter(
    (p) => new Date(p.since) <= yearAgo && (p.leftAt === null || new Date(p.leftAt) > yearAgo),
  );
  const kept = cohort.filter((p) => p.status !== 'left');
  const ninetyAgo = now.getTime() - 90 * DAY_MS;
  const leftInLast90Days = patrons.filter(
    (p) => p.status === 'left' && p.leftAt !== null && new Date(p.leftAt).getTime() >= ninetyAgo,
  ).length;
  return {
    percent: cohort.length === 0 ? null : Math.round((kept.length / cohort.length) * 100),
    leftInLast90Days,
  };
}

/** Was this patron active at the given instant (joined on or before it, not yet left)? */
export function wasActiveAt(patron: Pick<PatronRecord, 'since' | 'leftAt'>, at: Date): boolean {
  return new Date(patron.since) <= at && (patron.leftAt === null || new Date(patron.leftAt) > at);
}

export interface MrrMonth {
  /** YYYY-MM */
  month: string;
  gross: number;
}

/**
 * P-16: six months of gross MRR before fees, oldest first. A past month's
 * figure is who was paying at the end of it; the current month is who is
 * paying now. Uses each patron's own recorded price, so a later tier price
 * change never rewrites history (grandfathering, owner decision step 4.1).
 */
export function mrrHistory(
  patrons: readonly Pick<PatronRecord, 'status' | 'since' | 'leftAt' | 'price'>[],
  now: Date,
  months = 6,
): MrrMonth[] {
  const out: MrrMonth[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const month = monthStart.toISOString().slice(0, 7);
    if (i === 0) {
      out.push({ month, gross: grossMrr(patrons) });
      continue;
    }
    const monthEnd = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1) - 1,
    );
    const gross = patrons
      .filter((p) => wasActiveAt(p, monthEnd))
      .reduce((sum, p) => sum + p.price, 0);
    out.push({ month, gross: roundCents(gross) });
  }
  return out;
}

/** P-15's "+2 this month": joins minus departures since the first of the month. */
export function netChangeThisMonth(
  patrons: readonly Pick<PatronRecord, 'since' | 'leftAt'>[],
  now: Date,
): number {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const joined = patrons.filter((p) => new Date(p.since) >= monthStart).length;
  const left = patrons.filter((p) => p.leftAt !== null && new Date(p.leftAt) >= monthStart).length;
  return joined - left;
}

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}
