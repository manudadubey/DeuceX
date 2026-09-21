import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type ReserveCause = 'player' | 'received_prize';
export type ReserveEntry = Database['public']['Tables']['reserve_entries']['Row'];

export type ReceivableEvent = 'singles' | 'doubles';
export type ReceivableStatus = 'pending' | 'received' | 'no_prize';
export type PrizeReceivable = Database['public']['Tables']['prize_receivables']['Row'];

export class InvalidReserveAmountError extends Error {
  constructor() {
    super('Updating the balance requires a non-zero amount (F-3)');
    this.name = 'InvalidReserveAmountError';
  }
}

export async function getLatestReserveBalance(
  client: SupabaseClient<Database>,
  playerId: string,
): Promise<ReserveEntry | null> {
  const { data, error } = await client
    .from('reserve_entries')
    .select('*')
    .eq('player_id', playerId)
    .order('entered_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listReserveEntries(
  client: SupabaseClient<Database>,
  playerId: string,
): Promise<ReserveEntry[]> {
  const { data, error } = await client
    .from('reserve_entries')
    .select('*')
    .eq('player_id', playerId)
    .order('entered_at', { ascending: false });
  if (error) throw error;
  return data;
}

export interface EnterReserveBalanceInput {
  playerId: string;
  amount: number;
  currency: string;
  device?: string | null;
}

// The player's own direct write (PRD-03 F-2/F-3): no vendor call, so this
// runs on the caller's RLS-scoped client the same way notes.ts and
// players.ts's finishOnboarding do — ledger_lines_insert_own's with-check
// (cause = 'player') is the real authorization, not this function.
// F-3: "records previous and new values with a timestamp" — previous_amount
// is read from the latest existing row (or null for a player's first ever
// entry), never trusted from the caller.
export async function enterReserveBalance(
  client: SupabaseClient<Database>,
  input: EnterReserveBalanceInput,
): Promise<ReserveEntry> {
  if (!(input.amount > 0)) throw new InvalidReserveAmountError();

  const previous = await getLatestReserveBalance(client, input.playerId);

  const { data, error } = await client
    .from('reserve_entries')
    .insert({
      player_id: input.playerId,
      amount: input.amount,
      currency: input.currency,
      previous_amount: previous?.amount ?? null,
      cause: 'player',
      device: input.device ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listPrizeReceivables(
  client: SupabaseClient<Database>,
  playerId: string,
): Promise<PrizeReceivable[]> {
  const { data, error } = await client
    .from('prize_receivables')
    .select('*')
    .eq('player_id', playerId)
    .order('expected_date', { ascending: true });
  if (error) throw error;
  return data;
}
