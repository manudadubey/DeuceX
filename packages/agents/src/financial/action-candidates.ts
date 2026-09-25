import type { FinancialPendingReceivable } from './types';
import type { WeeklyBudgetBar } from './budget';

// PRD-03 section 7's ranked candidate list is "publish a pending patron
// update, update a stale balance, book accommodation for an Entered event
// inside ten days, chase an overdue receivable, trim a category over
// estimate." Only the middle three are buildable this step: publishing a
// patron update needs the Content Agent (step 4.2) and booking accommodation
// needs an Entered event (Tournament Agent, step 3.2). Both are left out of
// the pool entirely rather than faked, the same "not yet, documented"
// pattern mindset-coach's hasMatchToday/rankingDelta stubs already use.
export type ActionCandidateKey =
  'update_balance' | 'chase_overdue_receivable' | 'trim_weekly_overspend';

export interface ActionCandidate {
  key: ActionCandidateKey;
  /** Runway weeks the action is estimated to add or protect — a placeholder scale (PRD-03 section 12 flags several of this agent's own formulas the same way), refined once real usage data exists. */
  effectWeeks: number;
  hoursEffort: number;
  score: number;
  facts: ActionCandidateFacts;
  /** The receivable a chase_overdue_receivable candidate is about. Kept out of facts so it never reaches the prompt; it lets a "Mark received" approval link the run that proposed it (PRD-13 AD-13). */
  receivableId?: string;
}

export type ActionCandidateFacts =
  | { key: 'update_balance'; daysSinceUpdate: number | null }
  | {
      key: 'chase_overdue_receivable';
      label: string;
      daysOverdue: number;
      amountHomeEstimate: number;
    }
  | { key: 'trim_weekly_overspend'; overAmount: number };

const OVERDUE_DAYS_THRESHOLD = 7;
const STALE_BALANCE_DAYS_THRESHOLD = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS);
}

export interface ActionCandidateInput {
  lastReserveEntryAt: string | null;
  overdueReceivables: readonly FinancialPendingReceivable[];
  weeklyBudgetBar: WeeklyBudgetBar | null;
  netBurn: number;
  now?: Date;
}

// update_balance is always generated, even at effectWeeks 0, so the pool is
// never empty (F-18: "exactly one" action is always produced).
function updateBalanceCandidate(input: ActionCandidateInput, now: Date): ActionCandidate {
  const daysSinceUpdate = input.lastReserveEntryAt
    ? daysBetween(now, new Date(input.lastReserveEntryAt))
    : null;
  const stale = daysSinceUpdate === null || daysSinceUpdate >= STALE_BALANCE_DAYS_THRESHOLD;
  const effectWeeks = stale ? 0.1 : 0;
  const hoursEffort = 0.02;
  return {
    key: 'update_balance',
    effectWeeks,
    hoursEffort,
    score: hoursEffort > 0 ? effectWeeks / hoursEffort : 0,
    facts: { key: 'update_balance', daysSinceUpdate },
  };
}

function overdueReceivableCandidates(input: ActionCandidateInput, now: Date): ActionCandidate[] {
  const hoursEffort = 0.25;
  return input.overdueReceivables
    .map((r) => {
      const daysOverdue = daysBetween(now, new Date(r.expectedDate));
      if (daysOverdue < OVERDUE_DAYS_THRESHOLD) return null;
      const effectWeeks = input.netBurn > 0 ? r.amountHomeEstimate / input.netBurn : 0;
      const candidate: ActionCandidate = {
        key: 'chase_overdue_receivable',
        effectWeeks,
        hoursEffort,
        score: effectWeeks / hoursEffort,
        receivableId: r.id,
        facts: {
          key: 'chase_overdue_receivable',
          label: r.label,
          daysOverdue,
          amountHomeEstimate: r.amountHomeEstimate,
        },
      };
      return candidate;
    })
    .filter((c): c is ActionCandidate => c !== null);
}

function trimWeeklyOverspendCandidate(input: ActionCandidateInput): ActionCandidate | null {
  if (!input.weeklyBudgetBar || input.weeklyBudgetBar.state !== 'red') return null;
  const hoursEffort = 0.5;
  const effectWeeks = input.netBurn > 0 ? input.weeklyBudgetBar.overAmount / input.netBurn : 0;
  return {
    key: 'trim_weekly_overspend',
    effectWeeks,
    hoursEffort,
    score: effectWeeks / hoursEffort,
    facts: { key: 'trim_weekly_overspend', overAmount: input.weeklyBudgetBar.overAmount },
  };
}

// Builds the full pool, highest score first. snoozedKeys (F-18/F-AC-10)
// removes a candidate until its snooze passes; if that would empty the
// pool entirely, the snooze is ignored rather than showing nothing (F-18
// always produces exactly one action).
export function rankActionCandidates(
  input: ActionCandidateInput,
  snoozedKeys: ReadonlySet<string> = new Set(),
): ActionCandidate[] {
  const now = input.now ?? new Date();
  const pool = [
    updateBalanceCandidate(input, now),
    ...overdueReceivableCandidates(input, now),
    trimWeeklyOverspendCandidate(input),
  ].filter((c): c is ActionCandidate => c !== null);

  const sorted = [...pool].sort((a, b) => b.score - a.score);
  const withoutSnoozed = sorted.filter((c) => !snoozedKeys.has(c.key));
  return withoutSnoozed.length > 0 ? withoutSnoozed : sorted;
}
