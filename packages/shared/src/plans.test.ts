import { describe, expect, it } from 'vitest';
import {
  ANNUAL_SAVING_LABEL,
  PAID_PLANS,
  planAnnualSavingPercent,
  planChargeAmount,
  planPriceLine,
  planPriceLookupKey,
  planYearlyTotal,
} from './plans';

describe('plan prices (docs/BILLING-DECISIONS.md)', () => {
  it('matches the owner-set USD prices', () => {
    expect(planChargeAmount('pro', 'monthly')).toBe(35);
    expect(planChargeAmount('pro', 'annual')).toBe(336);
    expect(planChargeAmount('elite', 'monthly')).toBe(99);
    expect(planChargeAmount('elite', 'annual')).toBe(948);
  });

  it('keeps "Save 20%" true for every plan', () => {
    expect(ANNUAL_SAVING_LABEL).toBe('Save 20%');
    for (const plan of PAID_PLANS) expect(planAnnualSavingPercent(plan)).toBeGreaterThanOrEqual(20);
  });

  it('states the yearly total beside the monthly equivalent', () => {
    expect(planPriceLine('pro', 'monthly')).toBe('US$35 a month');
    expect(planPriceLine('elite', 'annual')).toBe(
      `US$79 a month, billed yearly (US$${planYearlyTotal('elite')})`,
    );
  });

  it('names Stripe lookup keys predictably', () => {
    expect(planPriceLookupKey('pro', 'annual')).toBe('deucex_pro_annual');
  });
});
