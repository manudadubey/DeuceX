// Plan prices and trial constants (docs/BILLING-DECISIONS.md, owner
// decisions of 27 September 2026). Plans are priced and billed in USD; a
// player sees an approximate home-currency figure beside it, derived from
// the FX archive at read time, never stored. Shared so onboarding, Settings,
// the locked-surface trial buttons and apps/api's Checkout all quote the
// same numbers.

export type PaidPlan = 'pro' | 'elite';
export type BillingCycle = 'monthly' | 'annual';

export const PAID_PLANS: readonly PaidPlan[] = ['pro', 'elite'];

/** Whole US dollars. `annualMonthly` is the monthly equivalent of the yearly price. */
export const PLAN_PRICES_USD: Record<PaidPlan, { monthly: number; annualMonthly: number }> = {
  pro: { monthly: 35, annualMonthly: 28 },
  elite: { monthly: 99, annualMonthly: 79 },
};

export const TRIAL_DAYS = 14;
/** The card is asked for on day 12: two days before the trial ends. */
export const TRIAL_REMINDER_DAYS_BEFORE_END = 2;

/** The label on the Yearly toggle. True for both plans (see planAnnualSavingPercent). */
export const ANNUAL_SAVING_LABEL = 'Save 20%';

export function planYearlyTotal(plan: PaidPlan): number {
  return PLAN_PRICES_USD[plan].annualMonthly * 12;
}

/** What the player pays per charge: the monthly price, or the yearly total. */
export function planChargeAmount(plan: PaidPlan, cycle: BillingCycle): number {
  return cycle === 'monthly' ? PLAN_PRICES_USD[plan].monthly : planYearlyTotal(plan);
}

/** The yearly saving against twelve monthly charges, rounded down. */
export function planAnnualSavingPercent(plan: PaidPlan): number {
  const monthlyYear = PLAN_PRICES_USD[plan].monthly * 12;
  return Math.floor(((monthlyYear - planYearlyTotal(plan)) / monthlyYear) * 100);
}

/** The Stripe price lookup key for a plan and cycle (apps/api/scripts/billing-prices.ts creates them). */
export function planPriceLookupKey(plan: PaidPlan, cycle: BillingCycle): string {
  return `deucex_${plan}_${cycle}`;
}

export function formatUsd(amount: number): string {
  return `US$${amount.toLocaleString('en-US')}`;
}

/**
 * "US$35 a month" or "US$28 a month, billed yearly (US$336)": the yearly
 * total is always stated beside the monthly equivalent (Australian Consumer
 * Law's no-drip-pricing rule, PRD-11 section 12).
 */
export function planPriceLine(plan: PaidPlan, cycle: BillingCycle): string {
  if (cycle === 'monthly') return `${formatUsd(PLAN_PRICES_USD[plan].monthly)} a month`;
  return `${formatUsd(PLAN_PRICES_USD[plan].annualMonthly)} a month, billed yearly (${formatUsd(planYearlyTotal(plan))})`;
}

export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === 'pro' || value === 'elite';
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === 'monthly' || value === 'annual';
}
