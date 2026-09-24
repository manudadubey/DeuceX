import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type ConditionsBriefRow = Database['public']['Tables']['conditions_briefs']['Row'];

export async function listConditionsBriefs(
  client: SupabaseClient<Database>,
  playerId: string,
): Promise<ConditionsBriefRow[]> {
  const { data, error } = await client
    .from('conditions_briefs')
    .select('*')
    .eq('player_id', playerId);
  if (error) throw error;
  return data;
}
