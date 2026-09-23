import { describe, expect, it } from 'vitest';
import { computeBudgetVsActual, computeWeeklyBudgetBar } from './budget';
import type { FinancialBudgetEstimate, FinancialLedgerLine } from './types';

// PRD-03 F-AC-9: "the Genoa row reads 'est A$1,900 · A$2,425 · +28%' in
// amber, and Poznań reads 'not started'."
describe('computeBudgetVsActual (F-AC-9)', () => {
  const estimates: FinancialBudgetEstimate[] = [
    { label: 'Genoa', estimateAmount: 1900, estimatedAt: '2026-08-01T00:00:00Z' },
    { label: 'Poznań', estimateAmount: 1360, estimatedAt: '2026-09-01T00:00:00Z' },
    { label: 'Sibiu', estimateAmount: 960, estimatedAt: '2026-08-15T00:00:00Z' },
  ];
  const lines: FinancialLedgerLine[] = [
    {
      id: '1',
      date: '2026-09-01',
      category: 'travel',
      what: 'a',
      amountHome: 1500,
      label: 'Genoa',
    },
    {
      id: '2',
      date: '2026-09-02',
      category: 'accommodation',
      what: 'b',
      amountHome: 925,
      label: 'Genoa',
    },
    {
      id: '3',
      date: '2026-08-20',
      category: 'coaching',
      what: 'c',
      amountHome: 130,
      label: 'Sibiu',
    },
  ];

  it('Genoa reads +28% over estimate', () => {
    const rows = computeBudgetVsActual(estimates, lines);
    const genoa = rows.find((r) => r.label === 'Genoa');
    expect(genoa?.actualAmount).toBe(2425);
    expect(genoa?.variancePercent).toBe(28);
    expect(genoa?.over).toBe(true);
  });

  it('Sibiu reads -86% under estimate', () => {
    const rows = computeBudgetVsActual(estimates, lines);
    const sibiu = rows.find((r) => r.label === 'Sibiu');
    expect(sibiu?.variancePercent).toBe(-86);
    expect(sibiu?.over).toBe(false);
  });

  it('Poznań has nothing logged yet: "not started"', () => {
    const rows = computeBudgetVsActual(estimates, lines);
    const poznan = rows.find((r) => r.label === 'Poznań');
    expect(poznan?.actualAmount).toBe(0);
    expect(poznan?.variancePercent).toBeNull();
  });
});

// PRD-03 F-AC-9: "A$1,445 of expenses... against a A$1,200 budget... #wkBar
// is red at 100 percent, #wkSub reads 'A$245 over budget...'"
describe('computeWeeklyBudgetBar (F-AC-9)', () => {
  it('reads red and over by the exact overage amount', () => {
    const now = new Date('2026-09-13T12:00:00Z'); // a Sunday
    const lines: FinancialLedgerLine[] = [
      { id: '1', date: '2026-09-07', category: 'travel', what: 'a', amountHome: 800, label: null },
      { id: '2', date: '2026-09-10', category: 'food', what: 'b', amountHome: 645, label: null },
    ];
    const bar = computeWeeklyBudgetBar(lines, 1200, now);
    expect(bar.spent).toBe(1445);
    expect(bar.state).toBe('red');
    expect(bar.overAmount).toBe(245);
    expect(bar.percent).toBe(100); // capped even though spend exceeds budget
  });

  it('reads amber above 80 percent but not yet over', () => {
    const now = new Date('2026-09-13T12:00:00Z');
    const lines: FinancialLedgerLine[] = [
      { id: '1', date: '2026-09-08', category: 'food', what: 'a', amountHome: 1000, label: null },
    ];
    const bar = computeWeeklyBudgetBar(lines, 1200, now);
    expect(bar.state).toBe('amber');
    expect(bar.overAmount).toBe(0);
  });

  it('excludes expenses outside the Monday-Sunday window', () => {
    const now = new Date('2026-09-13T12:00:00Z'); // week of 7-13 Sep
    const lines: FinancialLedgerLine[] = [
      {
        id: '1',
        date: '2026-09-06',
        category: 'food',
        what: 'last week',
        amountHome: 5000,
        label: null,
      },
    ];
    const bar = computeWeeklyBudgetBar(lines, 1200, now);
    expect(bar.spent).toBe(0);
    expect(bar.state).toBe('ok');
  });
});
