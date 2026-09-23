import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import { convertAtRate, getFxRates, type LedgerLine, type PrizeReceivable } from '@procircuit/db';
import {
  computeBudgetVsActual,
  computeBurnState,
  computeGrossWeeklySpend,
  computeMilestone,
  computeMonthlyPnl,
  computeProjection,
  computeRunwayWeeks,
  computeWeeklyBudgetBar,
  rankActionCandidates,
  runwayColour,
  weeksUntilRed,
  zeroDate,
  type ActionCandidate,
  type BudgetVsActualRow,
  type FinancialBudgetEstimate,
  type FinancialLedgerLine,
  type FinancialPendingReceivable,
  type Milestone,
  type MonthlyPnl,
  type ProjectionResult,
  type RunwayColour,
  type WeeklyBudgetBar,
} from '@procircuit/agents';

const LOOKBACK_DAYS = 60;

function ratesToEurMap(rates: Record<string, { rateToEur: number }>): Record<string, number> {
  return Object.fromEntries(Object.entries(rates).map(([currency, r]) => [currency, r.rateToEur]));
}

export interface FinancialAction {
  candidateKey: string;
  effectWeeks: number;
  text: string;
  secondSentence: string | null;
}

export interface FinancialSnapshot {
  homeCurrency: string;
  reserves: number;
  lastReserveEntryAt: string | null;
  grossWeeklySpend: number;
  patronWeeklyIncome: number;
  netBurn: number;
  coverage: number;
  runwayWeeks: number;
  runwayColour: RunwayColour;
  zeroDate: Date | null;
  /** PRD-03 §4.1's "If nothing changes / Red in 4.3 wks" alarm tile; 0 means "Red now". */
  weeksUntilRed: number;
  /** The with-pending line's own zero date (its own tile, never used for the reserves/runway figures — F-6). */
  zeroDateWithPending: Date | null;
  projection: ProjectionResult;
  weeklyBudgetBar: WeeklyBudgetBar | null;
  budgetVsActual: BudgetVsActualRow[];
  monthlyPnl: MonthlyPnl;
  milestone: Milestone;
  pendingReceivables: (FinancialPendingReceivable & { currency: string; round: string })[];
  ledgerLines: (FinancialLedgerLine & {
    receiptRef: string | null;
    source: string;
    currencyOriginal: string;
    amountOriginal: number;
  })[];
  candidates: ActionCandidate[];
  action: FinancialAction | null;
}

// The Financial Agent page's own deterministic maths, computed live and
// directly from the player's RLS-scoped rows (TECH-ARCHITECTURE.md section
// 1: simple reads are a client concern, not an apps/api round trip) — this
// is what "live runs recompute figures without regenerating the action"
// (PRD-03 section 3) means in practice: only the phrased "one thing"
// sentence (fetched below from the latest agent_runs row, never
// recomputed here) needs the scheduled/event agent run at all.
export async function loadFinancialSnapshot(
  supabase: SupabaseClient<Database>,
  playerId: string,
  homeCurrency: string,
  weeklyBudget: number | null,
  now: Date = new Date(),
): Promise<FinancialSnapshot> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [
    ledgerRes,
    reserveRes,
    receivablesRes,
    estimatesRes,
    snoozeRes,
    actionRes,
    realisedThisMonthRes,
    todayHomeRateRes,
  ] = await Promise.all([
    supabase.from('ledger_lines').select('*').eq('player_id', playerId).gte('date', since),
    supabase
      .from('reserve_entries')
      .select('amount, entered_at')
      .eq('player_id', playerId)
      .order('entered_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('prize_receivables')
      .select('*')
      .eq('player_id', playerId)
      .eq('status', 'pending'),
    supabase
      .from('budget_estimates')
      .select('id, label, estimate_amount, estimated_at')
      .eq('player_id', playerId),
    supabase
      .from('financial_action_snoozes')
      .select('candidate_key')
      .eq('player_id', playerId)
      .gt('snoozed_until', now.toISOString()),
    supabase
      .from('agent_runs')
      .select('output, status')
      .eq('player_id', playerId)
      .eq('agent_name', 'financial')
      .eq('status', 'succeeded')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // The realised (received) side of the month's P&L (F-19, M-DATA-2): the
    // delta each receivable-received reserve entry added, the same
    // derivation apps/api/src/financial/service.ts uses, reusing step 2.1's
    // already-correct markReceivableReceived math rather than recomputing
    // an fx conversion here.
    supabase
      .from('reserve_entries')
      .select('amount, previous_amount')
      .eq('player_id', playerId)
      .eq('cause', 'received_prize')
      .gte('entered_at', `${today.slice(0, 7)}-01`),
    getFxRates(supabase, today, [homeCurrency]),
  ]);
  if (ledgerRes.error) throw ledgerRes.error;
  if (reserveRes.error) throw reserveRes.error;
  if (receivablesRes.error) throw receivablesRes.error;
  if (estimatesRes.error) throw estimatesRes.error;
  if (snoozeRes.error) throw snoozeRes.error;
  if (actionRes.error) throw actionRes.error;
  if (realisedThisMonthRes.error) throw realisedThisMonthRes.error;

  const ledgerRows: LedgerLine[] = ledgerRes.data ?? [];
  const estimateRows = estimatesRes.data ?? [];
  const labelById = new Map(estimateRows.map((e) => [e.id, e.label]));
  const currencies = [...new Set(ledgerRows.map((l) => l.currency_original))];
  const ratesByDate = new Map<string, Record<string, number>>();
  for (const line of ledgerRows) {
    if (!ratesByDate.has(line.fx_rate_date)) {
      ratesByDate.set(
        line.fx_rate_date,
        ratesToEurMap(await getFxRates(supabase, line.fx_rate_date, currencies)),
      );
    }
  }

  const ledgerLines = ledgerRows.map((l) => {
    const rates = ratesByDate.get(l.fx_rate_date) ?? {};
    return {
      id: l.id,
      date: l.date,
      category: l.category,
      what: l.what,
      amountHome: convertAtRate(l.amount_original, l.currency_original, homeCurrency, rates),
      label: l.tournament_id ? (labelById.get(l.tournament_id) ?? null) : null,
      receiptRef: l.receipt_ref,
      source: l.source,
      currencyOriginal: l.currency_original,
      amountOriginal: l.amount_original,
    };
  });

  const grossWeeklySpend = computeGrossWeeklySpend(ledgerLines, now);
  const patronMrr = 0; // step 4.1 stub — see docs/BUILD-LOG.md's step 2.2 entry
  const burn = computeBurnState(grossWeeklySpend, patronMrr);
  const runwayWeeks = computeRunwayWeeks(reserveRes.data?.amount ?? 0, burn.netBurn);
  const weeklyBudgetBar =
    weeklyBudget != null ? computeWeeklyBudgetBar(ledgerLines, weeklyBudget, now) : null;

  const budgetEstimates: FinancialBudgetEstimate[] = estimateRows.map((e) => ({
    label: e.label,
    estimateAmount: e.estimate_amount,
    estimatedAt: e.estimated_at,
  }));
  const budgetVsActual = computeBudgetVsActual(budgetEstimates, ledgerLines);

  const monthStart = `${today.slice(0, 7)}-01`;
  const receivedPrizeIncomeHome = (realisedThisMonthRes.data ?? []).map(
    (row) => row.amount - (row.previous_amount ?? 0),
  );
  const monthlyPnl = computeMonthlyPnl({
    expensesInMonth: ledgerLines.filter((l) => l.date >= monthStart),
    receivedPrizeIncomeHome,
    receivedPatronPayoutsHome: [], // step 4.1 stub — see docs/BUILD-LOG.md's step 2.2 entry
  });

  const milestone = computeMilestone(burn.coverage, burn.grossWeeklySpend);

  const homeRateToday = todayHomeRateRes[homeCurrency]?.rateToEur;
  const receivableRows: PrizeReceivable[] = receivablesRes.data ?? [];
  const pendingReceivables = await Promise.all(
    receivableRows.map(async (r) => {
      const netOriginal = r.gross_amount * r.player_share - r.withholding_amount;
      let amountHomeEstimate = 0;
      if (homeRateToday != null) {
        try {
          const rates =
            r.currency === homeCurrency
              ? {}
              : ratesToEurMap(await getFxRates(supabase, today, [r.currency, homeCurrency]));
          amountHomeEstimate = convertAtRate(netOriginal, r.currency, homeCurrency, rates);
        } catch {
          amountHomeEstimate = 0;
        }
      }
      return {
        id: r.id,
        label: r.tournament_id ? (labelById.get(r.tournament_id) ?? r.round) : r.round,
        round: r.round,
        currency: r.currency,
        amountHomeEstimate,
        expectedDate: r.expected_date,
      };
    }),
  );

  const projection = computeProjection({
    reserves: reserveRes.data?.amount ?? 0,
    netBurn: burn.netBurn,
    pendingReceivables,
    now,
  });

  const snoozedKeys = new Set((snoozeRes.data ?? []).map((s) => s.candidate_key));
  const candidates = rankActionCandidates(
    {
      lastReserveEntryAt: reserveRes.data?.entered_at ?? null,
      overdueReceivables: pendingReceivables,
      weeklyBudgetBar,
      netBurn: burn.netBurn,
      now,
    },
    snoozedKeys,
  );

  const cachedAction = actionRes.data?.output as unknown as FinancialAction | undefined;

  return {
    homeCurrency,
    reserves: reserveRes.data?.amount ?? 0,
    lastReserveEntryAt: reserveRes.data?.entered_at ?? null,
    grossWeeklySpend: burn.grossWeeklySpend,
    patronWeeklyIncome: burn.patronWeeklyIncome,
    netBurn: burn.netBurn,
    coverage: burn.coverage,
    runwayWeeks,
    runwayColour: runwayColour(runwayWeeks),
    zeroDate: zeroDate(runwayWeeks, now),
    weeksUntilRed: weeksUntilRed(runwayWeeks),
    zeroDateWithPending: zeroDate(projection.zeroWeekWithPending, now),
    projection,
    weeklyBudgetBar,
    budgetVsActual,
    monthlyPnl,
    milestone,
    pendingReceivables,
    ledgerLines,
    candidates,
    action: cachedAction ?? null,
  };
}
