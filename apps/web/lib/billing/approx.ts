'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { planChargeAmount, type BillingCycle, type PaidPlan } from '@deucex/shared';

// Decision 5 (docs/BILLING-DECISIONS.md): plans are billed in USD, with an
// approximate home-currency figure shown beside the price. Derived at read
// time from fx_rates_daily (ECB, units per euro), never stored. Null when
// the player's currency is USD or no rate is on file.
export function convertUsd(amountUsd: number, usdPerEur: number, homePerEur: number): number {
  return (amountUsd / usdPerEur) * homePerEur;
}

export function formatApprox(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export async function approximateHomeAmount(
  supabase: SupabaseClient<Database>,
  input: { plan: PaidPlan; cycle: BillingCycle; homeCurrency: string | null },
): Promise<string | null> {
  const home = input.homeCurrency?.toUpperCase();
  if (!home || home === 'USD') return null;
  const wanted = home === 'EUR' ? ['USD'] : ['USD', home];
  const { data } = await supabase
    .from('fx_rates_daily')
    .select('date, currency, rate_to_eur')
    .in('currency', wanted)
    .order('date', { ascending: false })
    .limit(20);
  const byDate = new Map<string, Map<string, number>>();
  for (const row of data ?? []) {
    const rates = byDate.get(row.date) ?? new Map<string, number>();
    if (!rates.has(row.currency)) rates.set(row.currency, Number(row.rate_to_eur));
    byDate.set(row.date, rates);
  }
  for (const rates of byDate.values()) {
    const usd = rates.get('USD');
    const homeRate = home === 'EUR' ? 1 : rates.get(home);
    if (usd && homeRate) {
      return formatApprox(
        convertUsd(planChargeAmount(input.plan, input.cycle), usd, homeRate),
        home,
      );
    }
  }
  return null;
}
