import { describe, expect, it } from 'vitest';
import {
  computeBurnState,
  computeGrossWeeklySpend,
  computeProjection,
  computeRunwayWeeks,
  runwayColour,
  weeksUntilRed,
  zeroDate,
} from './runway';
import type { FinancialLedgerLine, FinancialPendingReceivable } from './types';

// PRD-03 F-AC-1: "Given reserves A$9,450, gross weekly spend A$1,281 and MRR
// A$612, when the 07:00 UTC run completes, then #kRunway reads '8.3 wks' in
// amber, #kReservesSub reads 'A$1,140/wk net burn'... the MRR tile reads
// 'covers 11% of weekly spend'." This is the build plan's own step 2.2
// acceptance bar ("the runway reads 8.3 weeks"): the pure formula is proved
// against PRD-03's exact fixture numbers here, independent of where a real
// MRR figure comes from in production (apps/api/src/financial/service.ts
// always supplies 0 for it today — patrons/payouts don't exist until step
// 4.1 — which is a data-availability gap, not a formula bug).
describe('the Arya fixture (PRD-03 F-AC-1)', () => {
  const RESERVES = 9450;
  const GROSS_WEEKLY_SPEND = 1281;
  const MRR = 612;

  it('computes net burn as gross spend minus weekly patron income', () => {
    const burn = computeBurnState(GROSS_WEEKLY_SPEND, MRR);
    expect(Math.round(burn.netBurn)).toBe(1140);
    expect(burn.patronWeeklyIncome).toBeCloseTo((612 * 12) / 52, 5);
  });

  it('coverage reads 11% of weekly spend', () => {
    const burn = computeBurnState(GROSS_WEEKLY_SPEND, MRR);
    expect(Math.round(burn.coverage * 100)).toBe(11);
  });

  it('runway reads 8.3 weeks in amber', () => {
    const burn = computeBurnState(GROSS_WEEKLY_SPEND, MRR);
    const weeks = computeRunwayWeeks(RESERVES, burn.netBurn);
    expect(weeks).toBeCloseTo(8.3, 1);
    expect(runwayColour(weeks)).toBe('amber');
  });
});

describe('runwayColour', () => {
  it('is green at 10 weeks or more', () => {
    expect(runwayColour(10)).toBe('green');
    expect(runwayColour(14)).toBe('green');
  });

  it('is amber under 10 and at least 4', () => {
    expect(runwayColour(9.9)).toBe('amber');
    expect(runwayColour(4)).toBe('amber');
  });

  it('is red under 4', () => {
    expect(runwayColour(3.9)).toBe('red');
    expect(runwayColour(0)).toBe('red');
  });
});

describe('computeGrossWeeklySpend', () => {
  it('averages the trailing four weeks of expenses', () => {
    const now = new Date('2026-09-21T00:00:00Z');
    const lines: FinancialLedgerLine[] = [
      { id: '1', date: '2026-09-20', category: 'food', what: 'a', amountHome: 100, label: null },
      { id: '2', date: '2026-09-05', category: 'travel', what: 'b', amountHome: 300, label: null },
      // outside the 4-week window, excluded
      { id: '3', date: '2026-08-01', category: 'travel', what: 'c', amountHome: 900, label: null },
    ];
    expect(computeGrossWeeklySpend(lines, now)).toBeCloseTo(400 / 4, 5);
  });
});

describe('computeRunwayWeeks', () => {
  it('returns Infinity when net burn is zero or negative (fully covered)', () => {
    expect(computeRunwayWeeks(1000, 0)).toBe(Infinity);
    expect(computeRunwayWeeks(1000, -50)).toBe(Infinity);
  });
});

describe('computeProjection', () => {
  const now = new Date('2026-09-21T00:00:00Z');

  it('declines by net burn each week with no scenario or pending receivables', () => {
    const result = computeProjection({ reserves: 1000, netBurn: 100, now });
    expect(result.cashOnly[0]).toBe(900);
    expect(result.cashOnly[1]).toBe(800);
    expect(result.cashOnly).toHaveLength(14);
  });

  it('reaches zero and reports a fractional zero week matching the simple runway formula', () => {
    const result = computeProjection({ reserves: 850, netBurn: 100, now });
    // 850 / 100 = 8.5 weeks, same answer computeRunwayWeeks gives with no
    // scenario deltas.
    expect(result.zeroWeekCashOnly).toBeCloseTo(8.5, 5);
  });

  it('never lets the with-pending line count toward the cash-only line (F-6)', () => {
    const pending: FinancialPendingReceivable[] = [
      { id: 'pz-1', label: 'Genoa Q2', amountHomeEstimate: 500, expectedDate: '2026-10-03' },
    ];
    const result = computeProjection({
      reserves: 1000,
      netBurn: 100,
      pendingReceivables: pending,
      now,
    });
    expect(result.withPending.some((v, i) => v > result.cashOnly[i]!)).toBe(true);
    // cashOnly is computed independently of pending at every index.
    const withoutPending = computeProjection({ reserves: 1000, netBurn: 100, now });
    expect(result.cashOnly).toEqual(withoutPending.cashOnly);
  });

  // PRD-03 §4.1's own "With pending prize / 9.1 wks · Genoa cheque 3 Oct" tile.
  it('reports a later zero week for the with-pending line when a receivable lands before it', () => {
    const pending: FinancialPendingReceivable[] = [
      { id: 'pz-1', label: 'Genoa Q2', amountHomeEstimate: 500, expectedDate: '2026-09-28' }, // week 1
    ];
    const result = computeProjection({
      reserves: 850,
      netBurn: 100,
      pendingReceivables: pending,
      now,
    });
    expect(result.zeroWeekCashOnly).toBeCloseTo(8.5, 5);
    expect(result.zeroWeekWithPending).toBeGreaterThan(result.zeroWeekCashOnly);
  });

  it('applies a scenario delta (cost negative, prize positive) in its own week', () => {
    const result = computeProjection({
      reserves: 1000,
      netBurn: 100,
      scenarioDeltas: [
        { week: 3, amount: -200 },
        { week: 4, amount: 300 },
      ],
      now,
    });
    // week1: 900, week2: 800, week3: 800-100-200=500, week4: 500-100+300=700
    expect(result.cashOnly[2]).toBe(500);
    expect(result.cashOnly[3]).toBe(700);
  });
});

describe('zeroDate', () => {
  it('returns null for a non-finite runway', () => {
    expect(zeroDate(Infinity)).toBeNull();
  });

  it('adds runwayWeeks x 7 days to now', () => {
    const now = new Date('2026-09-21T00:00:00Z');
    const date = zeroDate(2, now);
    expect(date?.toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });
});

// PRD-03 §4.1's own "If nothing changes / Red in 4.3 wks" alarm tile.
describe('weeksUntilRed', () => {
  it('is the runway minus the 4-week red threshold', () => {
    expect(weeksUntilRed(8.3)).toBeCloseTo(4.3, 5);
  });

  it('floors at 0 ("Red now") rather than going negative', () => {
    expect(weeksUntilRed(3)).toBe(0);
  });

  it('is Infinity when runway itself is Infinity (fully covered)', () => {
    expect(weeksUntilRed(Infinity)).toBe(Infinity);
  });
});
