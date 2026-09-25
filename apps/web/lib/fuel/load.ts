import type { SupabaseClient } from '@supabase/supabase-js';
import {
  convertAtRate,
  getFxRates,
  getFuelProfile,
  listMealLogs,
  type Database,
  type MealLogRow,
} from '@deucex/db';
import {
  EMPTY_DIETARY_PROFILE,
  foodMoneyLeft,
  type DietaryProfile,
  type FuelAllergen,
  type FuelExclusion,
} from '@deucex/agents';

export interface FuelHistoryRow {
  meal: MealLogRow;
  priceHome: number | null;
}

export interface FuelSnapshot {
  profile: DietaryProfile;
  hasProfile: boolean;
  city: string | null;
  country: string | null;
  /** Home currency left for food today; null when no allowance is set. */
  foodMoneyLeft: number | null;
  /** True when a Food line today had no archived rate ("not refreshed"). */
  foodMoneyStale: boolean;
  history: FuelHistoryRow[];
}

// The player's local calendar date (en-CA formats as YYYY-MM-DD, the idiom
// the check-in card already uses).
export function localDate(timezone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(at);
}

async function toHome(
  supabase: SupabaseClient<Database>,
  amount: number,
  currency: string,
  rateDate: string,
  homeCurrency: string,
): Promise<number | null> {
  const rates = await getFxRates(supabase, rateDate, [currency, homeCurrency]);
  try {
    return convertAtRate(
      amount,
      currency,
      homeCurrency,
      Object.fromEntries(Object.entries(rates).map(([c, r]) => [c, r.rateToEur])),
    );
  } catch {
    return null;
  }
}

// Everything the Fuel page reads, directly and RLS-scoped (the Financial
// Agent's lib/financial/load.ts split): only the scan itself goes through
// apps/api. Money is converted here at each line's own locked rate date.
export async function loadFuelSnapshot(
  supabase: SupabaseClient<Database>,
  input: {
    playerId: string;
    timezone: string;
    homeCurrency: string;
    dailyFoodAllowance: number | null;
  },
): Promise<FuelSnapshot> {
  const today = localDate(input.timezone);

  const [profileRow, meals, foodLines, decisions] = await Promise.all([
    getFuelProfile(supabase, input.playerId),
    listMealLogs(supabase, input.playerId),
    supabase
      .from('ledger_lines')
      .select('amount_original, currency_original, fx_rate_date')
      .eq('player_id', input.playerId)
      .eq('category', 'food')
      .eq('date', today),
    supabase
      .from('entry_decisions')
      .select('tournament_id')
      .eq('player_id', input.playerId)
      .eq('status', 'entered'),
  ]);
  if (foodLines.error) throw foodLines.error;
  if (decisions.error) throw decisions.error;

  let city: string | null = null;
  let country: string | null = null;
  const ids = (decisions.data ?? []).map((d) => d.tournament_id);
  if (ids.length > 0) {
    const { data } = await supabase
      .from('tournaments')
      .select('city, country')
      .in('id', ids)
      .lte('start_date', today)
      .gte('end_date', today)
      .limit(1)
      .maybeSingle();
    city = data?.city ?? null;
    country = data?.country ?? null;
  }

  const spent = await Promise.all(
    (foodLines.data ?? []).map((l) =>
      toHome(supabase, l.amount_original, l.currency_original, l.fx_rate_date, input.homeCurrency),
    ),
  );
  const known = spent.filter((n): n is number => n !== null);

  const history = await Promise.all(
    meals.map(async (meal) => ({
      meal,
      priceHome: await toHome(
        supabase,
        meal.price_menu,
        meal.currency_menu,
        meal.rate_date,
        input.homeCurrency,
      ),
    })),
  );

  return {
    profile: profileRow
      ? {
          exclusions: profileRow.exclusions as FuelExclusion[],
          allergies: profileRow.allergies as FuelAllergen[],
          preferences: profileRow.preferences,
        }
      : EMPTY_DIETARY_PROFILE,
    hasProfile: profileRow !== null,
    city,
    country,
    foodMoneyLeft: foodMoneyLeft(input.dailyFoodAllowance, known),
    foodMoneyStale: known.length < spent.length,
    history,
  };
}
