import type { FinancialLedgerLine, FinancialPendingReceivable } from './types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TRAILING_WEEKS = 4;
const PROJECTION_WEEKS = 14;

export type RunwayColour = 'green' | 'amber' | 'red';

// PRD-03 section 7: green at 10 weeks or more, amber under 10, red under 4
// (F-5). Identical thresholds on the KPI tile, the dashboard tile and the
// daily notification, so this is the one place they all read from.
export function runwayColour(weeks: number): RunwayColour {
  if (weeks >= 10) return 'green';
  if (weeks < 4) return 'red';
  return 'amber';
}

// "Gross weekly spend = trailing four-week average of logged expenses
// including planned lines whose week has begun" (section 7; the four-week
// window is itself flagged as a placeholder in PRD-03 section 12, pending
// real receipts). Planned lines aren't distinguished here — a
// FinancialLedgerLine is already whatever `source` produced it converted to
// home currency, per the ledger.ts contract this reads from.
export function computeGrossWeeklySpend(
  lines: readonly FinancialLedgerLine[],
  now: Date = new Date(),
): number {
  const windowStart = now.getTime() - TRAILING_WEEKS * WEEK_MS;
  const total = lines
    .filter(
      (l) =>
        new Date(l.date).getTime() >= windowStart && new Date(l.date).getTime() <= now.getTime(),
    )
    .reduce((sum, l) => sum + l.amountHome, 0);
  return total / TRAILING_WEEKS;
}

export interface BurnState {
  grossWeeklySpend: number;
  patronWeeklyIncome: number;
  netBurn: number;
  /** patronWeeklyIncome / grossWeeklySpend; 0 when grossWeeklySpend is 0. */
  coverage: number;
}

// "Weekly patron income = gross MRR x 12 / 52" (section 7). patronMrr is
// always 0 in this step's real wiring (apps/api/src/financial/service.ts):
// patrons and payouts don't exist until step 4.1. The formula itself takes
// whatever it's given, which is what lets runway.test.ts prove PRD-03's own
// worked example (MRR 612 -> 8.3 weeks) independently of that stub.
export function computeBurnState(grossWeeklySpend: number, patronMrr: number): BurnState {
  const patronWeeklyIncome = (patronMrr * 12) / 52;
  const netBurn = grossWeeklySpend - patronWeeklyIncome;
  const coverage = grossWeeklySpend > 0 ? patronWeeklyIncome / grossWeeklySpend : 0;
  return { grossWeeklySpend, patronWeeklyIncome, netBurn, coverage };
}

// "Runway = reserves / net burn" (F-5), shown to one decimal. A net burn of
// zero or negative (spend fully covered, or over-covered) has no zero week
// at all — Infinity is the honest answer; callers display it as "steady" or
// similar rather than a number.
export function computeRunwayWeeks(reserves: number, netBurn: number): number {
  if (netBurn <= 0) return Infinity;
  return Math.round((reserves / netBurn) * 10) / 10;
}

export interface ScenarioDelta {
  /** Week offset from now, 1-indexed (week 1 is the coming week). */
  week: number;
  amount: number;
}

export interface ProjectionInput {
  reserves: number;
  netBurn: number;
  /** Poznań-style scenario deltas (cost negative, prize positive); always empty until step 3.2's Tournament Agent exists. */
  scenarioDeltas?: readonly ScenarioDelta[];
  pendingReceivables?: readonly FinancialPendingReceivable[];
  now?: Date;
}

export interface ProjectionResult {
  /** Index 0 is week 1; length PROJECTION_WEEKS. Cash-only, no pending receivables. */
  cashOnly: number[];
  /** Same weeks, with each pending receivable's estimated home-currency amount added in its expected week. Never counted toward the reserves/runway tiles (F-6). */
  withPending: number[];
  /** Weeks from now the cash-only line reaches zero, fractional (F-2's zero week formula); Infinity if it never does within the window and net burn isn't positive. */
  zeroWeekCashOnly: number;
  /** Same formula applied to the with-pending line (PRD-03 §4.1's own "9.1 wks · Genoa cheque 3 Oct" tile) — never used for the reserves/runway tiles themselves, only this one informational figure. */
  zeroWeekWithPending: number;
}

function weekOffsetFor(dateIso: string, now: Date): number {
  const diffMs = new Date(dateIso).getTime() - now.getTime();
  return Math.max(1, Math.ceil(diffMs / WEEK_MS));
}

// Section 7's recursive projection: "reserves(w) = max(0, reserves(w-1) -
// burn + scenario deltas in w [+ pending receivables in w for the
// with-pending line])." Runs PROJECTION_WEEKS forward from `now`. Given no
// Tournament Agent yet (step 3.2), scenarioDeltas is always empty in real
// production use, so cashOnly here is a straight decline by netBurn each
// week — the formula still runs in full generality so step 3.2 only needs
// to supply deltas, not touch this function.
export function computeProjection(input: ProjectionInput): ProjectionResult {
  const now = input.now ?? new Date();
  const scenarioDeltas = input.scenarioDeltas ?? [];
  const pending = input.pendingReceivables ?? [];

  const deltasByWeek = new Map<number, number>();
  for (const d of scenarioDeltas) {
    deltasByWeek.set(d.week, (deltasByWeek.get(d.week) ?? 0) + d.amount);
  }
  const pendingByWeek = new Map<number, number>();
  for (const p of pending) {
    const week = weekOffsetFor(p.expectedDate, now);
    if (week > PROJECTION_WEEKS) continue;
    pendingByWeek.set(week, (pendingByWeek.get(week) ?? 0) + p.amountHomeEstimate);
  }

  const cashOnly: number[] = [];
  const withPending: number[] = [];
  let cashBalance = input.reserves;
  let pendingBalance = input.reserves;
  let zeroWeekCashOnly = Infinity;
  let zeroWeekWithPending = Infinity;
  let foundZeroCash = false;
  let foundZeroPending = false;

  for (let week = 1; week <= PROJECTION_WEEKS; week++) {
    const delta = deltasByWeek.get(week) ?? 0;
    const pendingInflow = pendingByWeek.get(week) ?? 0;
    const outflowThisWeek = input.netBurn - delta;

    const previousCash = cashBalance;
    cashBalance = Math.max(0, cashBalance - input.netBurn + delta);
    cashOnly.push(cashBalance);

    if (!foundZeroCash && previousCash > 0 && cashBalance === 0) {
      zeroWeekCashOnly = outflowThisWeek > 0 ? week - 1 + previousCash / outflowThisWeek : week;
      foundZeroCash = true;
    }

    const previousPending = pendingBalance;
    pendingBalance = Math.max(0, pendingBalance - input.netBurn + delta + pendingInflow);
    withPending.push(pendingBalance);

    if (!foundZeroPending && previousPending > 0 && pendingBalance === 0) {
      const pendingOutflowThisWeek = outflowThisWeek - pendingInflow;
      zeroWeekWithPending =
        pendingOutflowThisWeek > 0 ? week - 1 + previousPending / pendingOutflowThisWeek : week;
      foundZeroPending = true;
    }
  }

  if (!foundZeroCash) {
    zeroWeekCashOnly =
      input.netBurn > 0 ? PROJECTION_WEEKS + cashBalance / input.netBurn : Infinity;
  }
  if (!foundZeroPending) {
    zeroWeekWithPending =
      input.netBurn > 0 ? PROJECTION_WEEKS + pendingBalance / input.netBurn : Infinity;
  }

  return { cashOnly, withPending, zeroWeekCashOnly, zeroWeekWithPending };
}

export function zeroDate(runwayWeeks: number, now: Date = new Date()): Date | null {
  if (!Number.isFinite(runwayWeeks)) return null;
  return new Date(now.getTime() + runwayWeeks * WEEK_MS);
}

// PRD-03 §4.1's "If nothing changes / Red in 4.3 wks" alarm tile: net burn
// is constant in this build's projection (no scenario deltas exist until
// step 3.2's Tournament Agent), so the runway crosses the red threshold (4
// weeks, F-5) exactly `runwayWeeks - 4` weeks from now. 0 means "Red now".
export function weeksUntilRed(runwayWeeks: number): number {
  if (!Number.isFinite(runwayWeeks)) return Infinity;
  return Math.max(0, Math.round((runwayWeeks - 4) * 10) / 10);
}
