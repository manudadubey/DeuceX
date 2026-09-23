import { describe, expect, it } from 'vitest';
import { computeMonthlyPnl } from './pnl';
import type { FinancialLedgerLine } from './types';

// Decisions worksheet 7 / PRD-03 F-19: "Fix the bug so month figures follow
// M-DATA-2... the September P&L excludes the pending Genoa cheque." This is
// the build plan's own step 2.2 acceptance bar ("September shows A$612 in
// with the Genoa cheque pending"): the Genoa receivable is never passed to
// this function as income at all while pending, only once realised — see
// receivedPrizeIncomeHome's own comment for why that's structural, not a
// filter this test could get wrong by omission.
describe('computeMonthlyPnl (PRD-03 F-19, decisions worksheet 7)', () => {
  const expenses: FinancialLedgerLine[] = [
    {
      id: '1',
      date: '2026-09-05',
      category: 'travel',
      what: 'flight',
      amountHome: 1200,
      label: null,
    },
    {
      id: '2',
      date: '2026-09-12',
      category: 'coaching',
      what: 'block',
      amountHome: 940,
      label: null,
    },
  ];

  it('September reads A$612 in, with the pending Genoa cheque excluded entirely', () => {
    const pnl = computeMonthlyPnl({
      expensesInMonth: expenses,
      receivedPrizeIncomeHome: [], // Genoa Q2 is still pending: not passed in at all
      receivedPatronPayoutsHome: [612],
    });
    expect(pnl.income).toBe(612);
    expect(pnl.spend).toBe(2140);
    expect(pnl.net).toBe(612 - 2140);
  });

  it('once a receivable is realised, its home-currency amount joins income', () => {
    const pnl = computeMonthlyPnl({
      expensesInMonth: expenses,
      receivedPrizeIncomeHome: [890], // Genoa Q2 realised this month
      receivedPatronPayoutsHome: [612],
    });
    expect(pnl.income).toBe(612 + 890);
  });
});
