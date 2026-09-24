import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@procircuit/db';
import { convertAtRate, getFxRates } from '@procircuit/db';
import { loadPatronIncome } from '../fans/income';
import type {
  ActionCandidate,
  FinancialBudgetEstimate,
  FinancialLedgerLine,
  FinancialPendingReceivable,
  GenerateFinancialActionResult,
} from '@procircuit/agents';

const LOOKBACK_DAYS = 60; // covers the 4-week burn window, the current Mon-Sun week and month-to-date

function daysAgoIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// convertAtRate (ledger.ts) takes currency -> rate_to_eur numbers directly;
// getFxRates (also ledger.ts) returns the richer FxRate shape (source
// included, for audit elsewhere). This project's own currency-to-number
// adapter between the two.
function ratesToEurMap(rates: Record<string, { rateToEur: number }>): Record<string, number> {
  return Object.fromEntries(Object.entries(rates).map(([currency, r]) => [currency, r.rateToEur]));
}

export interface FinancialPlayer {
  id: string;
  homeCurrency: string;
  weeklyBudget: number | null;
  tier: string | null;
}

export async function loadFinancialPlayer(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<FinancialPlayer | null> {
  const { data, error } = await db
    .from('players')
    .select('id, home_currency, weekly_budget, tier')
    .eq('id', playerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    homeCurrency: data.home_currency,
    weeklyBudget: data.weekly_budget,
    tier: data.tier,
  };
}

export interface FinancialInputs {
  homeCurrency: string;
  /** Last LOOKBACK_DAYS of expenses, converted to home currency. Callers filter this one list by date for the 4-week burn window, the current week and month-to-date (PRD-03's own three windows), rather than three separate queries. */
  ledgerLines: FinancialLedgerLine[];
  reserves: number;
  lastReserveEntryAt: string | null;
  pendingReceivables: FinancialPendingReceivable[];
  /** This month's realised prize inflows, home currency, already excluding anything still pending (M-DATA-2) — see the design note below on how this is derived. */
  receivedPrizeIncomeHome: number[];
  /** Paid patron payouts this month, home currency (step 4.1, fans/income.ts). */
  receivedPatronPayoutsHome: number[];
  patronMrr: number;
  budgetEstimates: FinancialBudgetEstimate[];
  snoozedKeys: Set<string>;
}

// Loads and converts every input the deterministic Financial Agent maths
// needs (packages/agents/src/financial's runway/pnl/budget/action-candidates
// modules), all in the player's home currency, at read time — the same
// "conversion is a view, never a stored column" rule ledger.ts's own
// convertLedgerLine already enforces (M-DATA-1).
export async function loadFinancialInputs(
  db: SupabaseClient<Database>,
  playerId: string,
  homeCurrency: string,
  now: Date,
): Promise<FinancialInputs> {
  const since = daysAgoIso(now, LOOKBACK_DAYS);
  const today = now.toISOString().slice(0, 10);

  const [
    ledgerRes,
    reserveRes,
    receivablesRes,
    estimatesRes,
    snoozeRes,
    realisedRes,
    todayRatesRes,
  ] = await Promise.all([
    db
      .from('ledger_lines')
      .select(
        'id, date, category, what, amount_original, currency_original, fx_rate_date, tournament_id',
      )
      .eq('player_id', playerId)
      .gte('date', since),
    db
      .from('reserve_entries')
      .select('amount, entered_at, previous_amount, cause')
      .eq('player_id', playerId)
      .order('entered_at', { ascending: false }),
    db
      .from('prize_receivables')
      .select(
        'id, round, tournament_id, gross_amount, player_share, withholding_amount, currency, expected_date',
      )
      .eq('player_id', playerId)
      .eq('status', 'pending'),
    db
      .from('budget_estimates')
      .select('id, label, estimate_amount, estimated_at')
      .eq('player_id', playerId),
    db
      .from('financial_action_snoozes')
      .select('candidate_key, snoozed_until')
      .eq('player_id', playerId)
      .gt('snoozed_until', now.toISOString()),
    db
      .from('reserve_entries')
      .select('amount, previous_amount, entered_at')
      .eq('player_id', playerId)
      .eq('cause', 'received_prize')
      .gte('entered_at', `${today.slice(0, 7)}-01`),
    getFxRates(db, today, [homeCurrency]),
  ]);
  if (ledgerRes.error) throw ledgerRes.error;
  if (reserveRes.error) throw reserveRes.error;
  if (receivablesRes.error) throw receivablesRes.error;
  if (estimatesRes.error) throw estimatesRes.error;
  if (snoozeRes.error) throw snoozeRes.error;
  if (realisedRes.error) throw realisedRes.error;

  const estimateRows = estimatesRes.data ?? [];
  const labelById = new Map(estimateRows.map((e) => [e.id, e.label]));

  const currencies = [...new Set((ledgerRes.data ?? []).map((l) => l.currency_original))];
  const ratesByDate = new Map<string, Record<string, number>>();
  for (const line of ledgerRes.data ?? []) {
    if (!ratesByDate.has(line.fx_rate_date)) {
      ratesByDate.set(
        line.fx_rate_date,
        ratesToEurMap(await getFxRates(db, line.fx_rate_date, currencies)),
      );
    }
  }

  const ledgerLines: FinancialLedgerLine[] = (ledgerRes.data ?? []).map((l) => {
    const rates = ratesByDate.get(l.fx_rate_date) ?? {};
    return {
      id: l.id,
      date: l.date,
      category: l.category,
      what: l.what,
      amountHome: convertAtRate(l.amount_original, l.currency_original, homeCurrency, rates),
      label: l.tournament_id ? (labelById.get(l.tournament_id) ?? null) : null,
    };
  });

  const reserveRows = reserveRes.data ?? [];
  const reserves = reserveRows[0]?.amount ?? 0;
  const lastReserveEntryAt = reserveRows[0]?.entered_at ?? null;

  const homeRateToday = todayRatesRes[homeCurrency]?.rateToEur;
  const pendingReceivables: FinancialPendingReceivable[] = [];
  for (const r of receivablesRes.data ?? []) {
    const netOriginal = r.gross_amount * r.player_share - r.withholding_amount;
    let amountHomeEstimate = 0;
    if (homeRateToday != null) {
      const currencyRates =
        r.currency === homeCurrency
          ? {}
          : ratesToEurMap(await getFxRates(db, today, [r.currency, homeCurrency]));
      try {
        amountHomeEstimate = convertAtRate(netOriginal, r.currency, homeCurrency, currencyRates);
      } catch {
        // No archived rate for this currency today yet: shown in the
        // Pending list in its own currency regardless (F-9), just left out
        // of the with-pending chart line for this run rather than failing
        // the whole agent run over one missing rate.
        amountHomeEstimate = 0;
      }
    }
    pendingReceivables.push({
      id: r.id,
      label: r.tournament_id ? (labelById.get(r.tournament_id) ?? r.round) : r.round,
      amountHomeEstimate,
      expectedDate: r.expected_date,
    });
  }

  const receivedPrizeIncomeHome = (realisedRes.data ?? []).map(
    (row) => row.amount - (row.previous_amount ?? 0),
  );

  const budgetEstimates: FinancialBudgetEstimate[] = estimateRows.map((e) => ({
    label: e.label,
    estimateAmount: e.estimate_amount,
    estimatedAt: e.estimated_at,
  }));

  const snoozedKeys = new Set((snoozeRes.data ?? []).map((s) => s.candidate_key));

  return {
    homeCurrency,
    ledgerLines,
    reserves,
    lastReserveEntryAt,
    pendingReceivables,
    receivedPrizeIncomeHome,
    // Step 4.1: real patron income (fans/income.ts), replacing step 2.2's 0 stub.
    ...(await loadPatronIncome(db, playerId, homeCurrency, today)),
    budgetEstimates,
    snoozedKeys,
  };
}

export interface WriteFinancialRunInput {
  playerId: string;
  action: GenerateFinancialActionResult | null;
  candidateKey: ActionCandidate['key'];
}

// F-18/M-NOTIF-1: at most one notification per run, only when a fresh
// action was actually generated this run (not when the cached one was
// reused — see run.ts's own caching-by-hash comment).
export async function sendFinancialNotification(
  db: SupabaseClient<Database>,
  playerId: string,
  body: string,
): Promise<void> {
  const { error } = await db.from('notifications').insert({
    player_id: playerId,
    agent: 'financial',
    category: 'fyi',
    title: 'This morning’s runway',
    body,
    action_href: '/agent/financial',
  });
  if (error) throw error;
}

export type FinancialRunOutput = Json;
