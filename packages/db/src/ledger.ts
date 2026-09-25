import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Hand-maintained unions for ledger_lines' check constraints (step 2.1
// migration), the same idiom notes.ts, mindset.ts and players.ts already use.
export type LedgerCategory =
  | 'travel'
  | 'accommodation'
  | 'coaching'
  | 'equipment'
  | 'food'
  | 'physio'
  | 'entry_fees'
  | 'other';

export type LedgerSource = 'manual' | 'scanned' | 'planned' | 'fuel';

export type LedgerLine = Database['public']['Tables']['ledger_lines']['Row'];

export class InvalidLedgerAmountError extends Error {
  constructor() {
    super(
      'An expense amount must be greater than zero (F-11: "Save without an amount is refused")',
    );
    this.name = 'InvalidLedgerAmountError';
  }
}

export interface InsertLedgerLineInput {
  playerId: string;
  date: string;
  category: LedgerCategory;
  what: string;
  amountOriginal: number;
  currencyOriginal: string;
  source: LedgerSource;
  tournamentId?: string | null;
  receiptRef?: string | null;
  unsureFields?: string[];
}

// The rate is locked at save (M-DATA-1, M-CUR-1): fx_rate_date is always
// the expense's own date, never "today," and no home-currency amount is
// computed or stored here at all — that's convertLedgerLine's job, applied
// at read time, which is what makes a later home-currency preference change
// touch zero stored rows.
export async function insertLedgerLine(
  client: SupabaseClient<Database>,
  input: InsertLedgerLineInput,
): Promise<LedgerLine> {
  if (!(input.amountOriginal > 0)) throw new InvalidLedgerAmountError();

  const { data, error } = await client
    .from('ledger_lines')
    .insert({
      player_id: input.playerId,
      tournament_id: input.tournamentId ?? null,
      date: input.date,
      category: input.category,
      what: input.what,
      amount_original: input.amountOriginal,
      currency_original: input.currencyOriginal,
      fx_rate_date: input.date,
      source: input.source,
      receipt_ref: input.receiptRef ?? null,
      unsure_fields: input.unsureFields ?? [],
      edits: [],
      fresh: true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export interface ListLedgerLinesFilter {
  fromDate?: string;
  toDate?: string;
}

export async function listLedgerLines(
  client: SupabaseClient<Database>,
  playerId: string,
  filter: ListLedgerLinesFilter = {},
): Promise<LedgerLine[]> {
  let query = client.from('ledger_lines').select('*').eq('player_id', playerId);
  if (filter.fromDate) query = query.gte('date', filter.fromDate);
  if (filter.toDate) query = query.lte('date', filter.toDate);
  const { data, error } = await query.order('date', { ascending: false });
  if (error) throw error;
  return data;
}

export interface FxRate {
  currency: string;
  rateToEur: number;
  source: 'ecb' | 'provisional';
}

export class MissingFxRateError extends Error {
  constructor(
    readonly date: string,
    readonly currency: string,
  ) {
    super(`No fx_rates_daily row for ${currency} on ${date}`);
    this.name = 'MissingFxRateError';
  }
}

// Thrown by convertAtRate, which only ever sees a currency->rate map, not a
// date — the caller (convertLedgerLine, or a service assembling ratesToEur
// via getFxRates) is what knows the date and should prefer MissingFxRateError
// itself wherever a date is in scope.
export class MissingRateForCurrencyError extends Error {
  constructor(readonly currency: string) {
    super(`No rate supplied for ${currency}`);
    this.name = 'MissingRateForCurrencyError';
  }
}

// EUR is the archive's own base currency (ECB publishes every other
// currency against it) and never appears as a row in fx_rates_daily itself,
// so it's special-cased here rather than requiring a synthetic rate=1 row
// per date.
export async function getFxRate(
  client: SupabaseClient<Database>,
  date: string,
  currency: string,
): Promise<FxRate | null> {
  if (currency === 'EUR') return { currency: 'EUR', rateToEur: 1, source: 'ecb' };

  const { data, error } = await client
    .from('fx_rates_daily')
    .select('currency, rate_to_eur, source')
    .eq('date', date)
    .eq('currency', currency);
  if (error) throw error;

  const rows = data ?? [];
  // Both a provisional and the real ECB row can exist for the same date
  // (step 0.2's design note: "both kept, both visible in audit"); the real
  // one is what display and money maths use once it lands.
  const chosen =
    rows.find((r) => r.source === 'ecb') ?? rows.find((r) => r.source === 'provisional');
  if (!chosen) return null;
  return {
    currency: chosen.currency,
    rateToEur: chosen.rate_to_eur,
    source: chosen.source as FxRate['source'],
  };
}

export async function getFxRates(
  client: SupabaseClient<Database>,
  date: string,
  currencies: readonly string[],
): Promise<Record<string, FxRate>> {
  const unique = [...new Set(currencies)];
  const rates = await Promise.all(unique.map((currency) => getFxRate(client, date, currency)));
  const result: Record<string, FxRate> = {};
  unique.forEach((currency, i) => {
    const rate = rates[i];
    if (rate) result[currency] = rate;
  });
  return result;
}

// The money model's one formula (TECH-ARCHITECTURE.md section 2.1):
// "computed as original-to-EUR divided by target-to-EUR for that same
// date, never a live re-fetch and never an overwrite of a stored value."
// ratesToEur maps currency -> "units of that currency per 1 EUR" (the ECB
// convention), keyed by the row's own fx_rate_date, never by "today."
export function convertAtRate(
  amountOriginal: number,
  currencyOriginal: string,
  targetCurrency: string,
  ratesToEur: Record<string, number>,
): number {
  if (currencyOriginal === targetCurrency) return amountOriginal;

  const originalRate = currencyOriginal === 'EUR' ? 1 : ratesToEur[currencyOriginal];
  const targetRate = targetCurrency === 'EUR' ? 1 : ratesToEur[targetCurrency];
  if (originalRate == null) throw new MissingRateForCurrencyError(currencyOriginal);
  if (targetRate == null) throw new MissingRateForCurrencyError(targetCurrency);

  return (amountOriginal / originalRate) * targetRate;
}

export interface LedgerLineDisplay {
  id: string;
  amountHome: number;
  targetCurrency: string;
  amountOriginal: number;
  currencyOriginal: string;
  fxRateDate: string;
}

// M-DATA-1's own acceptance example: given the line's original amount,
// currency and locked fx_rate_date, and that date's archived rates, produce
// the display amount in any target currency plus "the original underneath."
// Never touches the row itself, so calling this twice with two different
// target currencies (a home-currency preference change) alters no stored
// value — see ledger.test.ts for the €38.50 walk-through.
export function convertLedgerLine(
  line: Pick<LedgerLine, 'id' | 'amount_original' | 'currency_original' | 'fx_rate_date'>,
  targetCurrency: string,
  ratesToEur: Record<string, number>,
): LedgerLineDisplay {
  return {
    id: line.id,
    amountHome: convertAtRate(
      line.amount_original,
      line.currency_original,
      targetCurrency,
      ratesToEur,
    ),
    targetCurrency,
    amountOriginal: line.amount_original,
    currencyOriginal: line.currency_original,
    fxRateDate: line.fx_rate_date,
  };
}

export interface RateBetween {
  /** Units of `to` per one unit of `from`. */
  rate: number;
  /** The fx_rates_daily date the rate comes from. */
  date: string;
}

// The newest archived date on or before `onOrBefore` that has both
// currencies (ECB rows preferred over provisional ones on the same date),
// looking back at most `maxDaysBack` days. Fuel (step 4.3) shows a menu
// price at this rate and locks the logged line to its date, so a scan on a
// weekend or before ECB's daily publish still converts at the last
// published rate rather than showing nothing.
export async function latestRateBetween(
  client: SupabaseClient<Database>,
  from: string,
  to: string,
  onOrBefore: string,
  maxDaysBack = 10,
): Promise<RateBetween | null> {
  const needed = [from, to].filter((c) => c !== 'EUR');
  if (needed.length === 0 || from === to) return { rate: 1, date: onOrBefore };

  const earliest = new Date(`${onOrBefore}T00:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() - maxDaysBack);
  const { data, error } = await client
    .from('fx_rates_daily')
    .select('date, currency, rate_to_eur, source')
    .in('currency', needed)
    .lte('date', onOrBefore)
    .gte('date', earliest.toISOString().slice(0, 10))
    .order('date', { ascending: false });
  if (error) throw error;

  const byDate = new Map<string, Record<string, { rate: number; ecb: boolean }>>();
  for (const row of data ?? []) {
    const day = byDate.get(row.date) ?? {};
    const current = day[row.currency];
    const ecb = row.source === 'ecb';
    if (!current || (ecb && !current.ecb)) day[row.currency] = { rate: row.rate_to_eur, ecb };
    byDate.set(row.date, day);
  }
  const dates = [...byDate.keys()].sort().reverse();
  for (const date of dates) {
    const day = byDate.get(date)!;
    if (needed.every((c) => day[c])) {
      const ratesToEur = Object.fromEntries(Object.entries(day).map(([c, v]) => [c, v.rate]));
      return { rate: convertAtRate(1, from, to, ratesToEur), date };
    }
  }
  return null;
}
