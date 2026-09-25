import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { EcbRateAdapter } from './adapter';

export interface FxServiceLogger {
  error(...args: unknown[]): void;
}

// A marker currency to ask "have we already fully fetched today?" without
// a second round trip per currency. Any currency ECB always publishes would
// do; USD is the least likely to ever be dropped from the feed.
const MARKER_CURRENCY = 'USD';

async function hasRowFor(
  db: SupabaseClient<Database>,
  date: string,
  source: 'ecb' | 'provisional',
): Promise<boolean> {
  const { data, error } = await db
    .from('fx_rates_daily')
    .select('currency')
    .eq('date', date)
    .eq('currency', MARKER_CURRENCY)
    .eq('source', source)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// TECH-ARCHITECTURE.md section 2.1 / PRD-03's failure behaviour: "An
// unpublished ECB rate saves as provisional and is re-rated once, both
// rates audited." Idempotent and safe to call on every hourly tick
// (fx/scheduler.ts): once today's real ECB rates are stored, every later
// call this same day is a no-op; until then, each call carries yesterday's
// (or the last published) rates forward as a provisional row for today, so
// a ledger line saved before ECB's own daily publish still has a rate to
// lock against.
export async function fetchAndStoreDailyRates(
  db: SupabaseClient<Database>,
  adapter: EcbRateAdapter,
  opts: { now?: Date; logger?: FxServiceLogger } = {},
): Promise<{ inserted: 'ecb' | 'provisional' | 'none'; date: string }> {
  const now = opts.now ?? new Date();
  const today = todayUtc(now);

  if (await hasRowFor(db, today, 'ecb')) {
    return { inserted: 'none', date: today };
  }

  const feed = await adapter.fetchDailyRates();
  const source: 'ecb' | 'provisional' = feed.date === today ? 'ecb' : 'provisional';

  if (source === 'provisional' && (await hasRowFor(db, today, 'provisional'))) {
    return { inserted: 'none', date: today };
  }

  const rows = Object.entries(feed.rates).map(([currency, rateToEur]) => ({
    date: today,
    currency,
    rate_to_eur: rateToEur,
    source,
    fetched_at: now.toISOString(),
  }));

  const { error } = await db.from('fx_rates_daily').insert(rows);
  if (error) {
    // 23505 (unique_violation on date, currency, source): a concurrent tick
    // already inserted the same batch between our check and this insert —
    // harmless, the row this call wanted to write already exists.
    if ((error as { code?: string }).code === '23505') return { inserted: 'none', date: today };
    throw error;
  }

  return { inserted: source, date: today };
}
