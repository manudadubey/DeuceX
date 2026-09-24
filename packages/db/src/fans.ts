import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// The one Fans column a player writes directly (step 4.1's migration grants
// UPDATE on patron_programmes.names_line_enabled only): P-19's "Patron
// names" switch. Everything else in the patron programme is written by
// apps/api from Stripe's own state or through a gated action.
export async function setPatronNamesLine(
  client: SupabaseClient<Database>,
  input: { playerId: string; enabled: boolean },
): Promise<void> {
  const { error } = await client
    .from('patron_programmes')
    .update({ names_line_enabled: input.enabled })
    .eq('player_id', input.playerId);
  if (error) throw error;
}
