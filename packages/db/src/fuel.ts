import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Step 4.3 (PRD-07). fuel_profiles is player-written; menu_scans is
// service-role written by apps/api; meal_logs is written only through the
// log_fuel_pick/unlog_fuel_meal functions, which pair each meal with its
// Food ledger line (see the migration's design notes).

export type FuelProfileRow = Database['public']['Tables']['fuel_profiles']['Row'];
export type MenuScanRow = Database['public']['Tables']['menu_scans']['Row'];
export type MealLogRow = Database['public']['Tables']['meal_logs']['Row'];
export type MealOutcome = 'none' | 'worked' | 'flat';
export type MealOutcomeSource = 'tap-history' | 'tap-checkin' | 'inferred-mood';

export async function getFuelProfile(
  client: SupabaseClient<Database>,
  playerId: string,
): Promise<FuelProfileRow | null> {
  const { data, error } = await client
    .from('fuel_profiles')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface SaveFuelProfileInput {
  playerId: string;
  exclusions: string[];
  allergies: string[];
  preferences: string[];
}

// Insert on first save, update after. Not an upsert: the column grant lets
// a player update only the three lists (and updated_at), and PostgREST's
// upsert would also try to set player_id on conflict.
export async function saveFuelProfile(
  client: SupabaseClient<Database>,
  input: SaveFuelProfileInput,
): Promise<FuelProfileRow> {
  const values = {
    exclusions: input.exclusions,
    allergies: input.allergies,
    preferences: input.preferences,
    updated_at: new Date().toISOString(),
  };
  const existing = await getFuelProfile(client, input.playerId);
  const query = existing
    ? client.from('fuel_profiles').update(values).eq('player_id', input.playerId)
    : client.from('fuel_profiles').insert({ player_id: input.playerId, ...values });
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data;
}

export async function setNextMatch(
  client: SupabaseClient<Database>,
  playerId: string,
  nextMatch: { at: string; label: string | null } | null,
): Promise<void> {
  const { error } = await client
    .from('players')
    .update({ next_match_at: nextMatch?.at ?? null, next_match_label: nextMatch?.label ?? null })
    .eq('id', playerId);
  if (error) throw error;
}

export async function setDailyFoodAllowance(
  client: SupabaseClient<Database>,
  playerId: string,
  amount: number | null,
): Promise<void> {
  if (amount !== null && !(amount > 0)) throw new Error('A daily food amount must be above zero');
  const { error } = await client
    .from('players')
    .update({ daily_food_allowance: amount })
    .eq('id', playerId);
  if (error) throw error;
}

export async function listMealLogs(
  client: SupabaseClient<Database>,
  playerId: string,
  limit = 20,
): Promise<MealLogRow[]> {
  const { data, error } = await client
    .from('meal_logs')
    .select('*')
    .eq('player_id', playerId)
    .order('logged_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function logFuelPick(
  client: SupabaseClient<Database>,
  scanId: string,
  rank: number,
  device: string | null = null,
): Promise<{ mealId: string; expenseLineId: string }> {
  const { data, error } = await client.rpc('log_fuel_pick', {
    p_scan_id: scanId,
    p_rank: rank,
    ...(device ? { p_device: device } : {}),
  });
  if (error) throw error;
  return data as { mealId: string; expenseLineId: string };
}

export async function unlogFuelMeal(
  client: SupabaseClient<Database>,
  mealId: string,
): Promise<void> {
  const { error } = await client.rpc('unlog_fuel_meal', { p_meal_id: mealId });
  if (error) throw error;
}

export async function setMealOutcome(
  client: SupabaseClient<Database>,
  mealId: string,
  outcome: Exclude<MealOutcome, 'none'>,
  source: Exclude<MealOutcomeSource, 'inferred-mood'>,
): Promise<void> {
  const { error } = await client
    .from('meal_logs')
    .update({ outcome, outcome_source: source, outcome_at: new Date().toISOString() })
    .eq('id', mealId);
  if (error) throw error;
}
