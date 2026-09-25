import type { SupabaseClient } from '@supabase/supabase-js';
import { convertAtRate, getFxRates, type Database } from '@deucex/db';

// PRD-04 P-14: "Paid payouts appear in the Financial Agent as patron income
// lines on the payout date, and gross MRR by tier is available to its
// Patron MRR tab." Shared by the Financial Agent's scheduled run and the
// manager share view so both read patron income the same way apps/web's own
// lib/financial/load.ts does: each amount in its original currency,
// converted to the home currency at read time on its own date (M-DATA-1).

export interface PatronIncome {
  /** Gross MRR of active and past-due patrons, home currency. */
  patronMrr: number;
  /** Net of each payout Stripe marked paid this month, home currency. */
  receivedPatronPayoutsHome: number[];
}

export async function loadPatronIncome(
  db: SupabaseClient<Database>,
  playerId: string,
  homeCurrency: string,
  today: string,
): Promise<PatronIncome> {
  const [patronsRes, payoutsRes] = await Promise.all([
    db
      .from('patrons')
      .select('price, currency')
      .eq('player_id', playerId)
      .in('status', ['active', 'past_due']),
    db
      .from('payouts')
      .select('net, currency, paid_at, friday')
      .eq('player_id', playerId)
      .eq('status', 'paid')
      .gte('friday', `${today.slice(0, 7)}-01`),
  ]);
  if (patronsRes.error) throw patronsRes.error;
  if (payoutsRes.error) throw payoutsRes.error;

  const toHome = async (amount: number, currency: string, date: string): Promise<number> => {
    if (currency === homeCurrency) return amount;
    try {
      const rates = await getFxRates(db, date, [currency, homeCurrency]);
      return convertAtRate(
        amount,
        currency,
        homeCurrency,
        Object.fromEntries(Object.entries(rates).map(([c, r]) => [c, r.rateToEur])),
      );
    } catch {
      return 0; // no archived rate for that day: left out rather than guessed
    }
  };

  let patronMrr = 0;
  for (const p of patronsRes.data ?? [])
    patronMrr += await toHome(Number(p.price), p.currency, today);
  const receivedPatronPayoutsHome = await Promise.all(
    (payoutsRes.data ?? []).map((p) =>
      toHome(Number(p.net), p.currency, (p.paid_at ?? p.friday).slice(0, 10)),
    ),
  );
  return { patronMrr, receivedPatronPayoutsHome };
}
