import { describe, expect, it } from 'vitest';
import { rankActionCandidates } from './action-candidates';
import type { WeeklyBudgetBar } from './budget';

const now = new Date('2026-09-21T00:00:00Z');

describe('rankActionCandidates', () => {
  it('always includes update_balance, even with nothing else to flag (F-18: exactly one action always produced)', () => {
    const candidates = rankActionCandidates({
      lastReserveEntryAt: now.toISOString(),
      overdueReceivables: [],
      weeklyBudgetBar: null,
      netBurn: 1000,
      now,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.key).toBe('update_balance');
  });

  it('ranks an overdue receivable above a fresh balance', () => {
    const candidates = rankActionCandidates({
      lastReserveEntryAt: now.toISOString(),
      overdueReceivables: [
        { id: 'pz-1', label: 'Genoa Q2', amountHomeEstimate: 890, expectedDate: '2026-09-10' },
      ],
      weeklyBudgetBar: null,
      netBurn: 1000,
      now,
    });
    expect(candidates[0]?.key).toBe('chase_overdue_receivable');
  });

  it('does not flag a receivable less than 7 days past its expected date', () => {
    const candidates = rankActionCandidates({
      lastReserveEntryAt: now.toISOString(),
      overdueReceivables: [
        { id: 'pz-1', label: 'Genoa Q2', amountHomeEstimate: 890, expectedDate: '2026-09-16' },
      ],
      weeklyBudgetBar: null,
      netBurn: 1000,
      now,
    });
    expect(candidates.map((c) => c.key)).not.toContain('chase_overdue_receivable');
  });

  it('flags trim_weekly_overspend only when the weekly bar is red', () => {
    const amberBar: WeeklyBudgetBar = {
      spent: 1000,
      budget: 1200,
      percent: 83,
      state: 'amber',
      overAmount: 0,
    };
    const redBar: WeeklyBudgetBar = {
      spent: 1445,
      budget: 1200,
      percent: 100,
      state: 'red',
      overAmount: 245,
    };

    const withAmber = rankActionCandidates({
      lastReserveEntryAt: now.toISOString(),
      overdueReceivables: [],
      weeklyBudgetBar: amberBar,
      netBurn: 1140,
      now,
    });
    expect(withAmber.map((c) => c.key)).not.toContain('trim_weekly_overspend');

    const withRed = rankActionCandidates({
      lastReserveEntryAt: now.toISOString(),
      overdueReceivables: [],
      weeklyBudgetBar: redBar,
      netBurn: 1140,
      now,
    });
    const trim = withRed.find((c) => c.key === 'trim_weekly_overspend');
    expect(trim).toBeDefined();
    expect(trim?.effectWeeks).toBeCloseTo(245 / 1140, 5);
  });

  it('ignores a snooze that would otherwise empty the whole pool', () => {
    const candidates = rankActionCandidates(
      {
        lastReserveEntryAt: now.toISOString(),
        overdueReceivables: [],
        weeklyBudgetBar: null,
        netBurn: 1000,
        now,
      },
      new Set(['update_balance']),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.key).toBe('update_balance');
  });

  it('excludes a snoozed candidate when another one is still available', () => {
    const redBar: WeeklyBudgetBar = {
      spent: 1445,
      budget: 1200,
      percent: 100,
      state: 'red',
      overAmount: 245,
    };
    const candidates = rankActionCandidates(
      {
        lastReserveEntryAt: now.toISOString(),
        overdueReceivables: [],
        weeklyBudgetBar: redBar,
        netBurn: 1140,
        now,
      },
      new Set(['trim_weekly_overspend']),
    );
    expect(candidates.map((c) => c.key)).not.toContain('trim_weekly_overspend');
  });
});
