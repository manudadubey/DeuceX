import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.types';

export type EquipmentProfile = Database['public']['Tables']['equipment_profile']['Row'];
export type RestringCadence = 'everyMatch' | 'every8to10Sets' | 'whenDead';

export async function getEquipmentProfile(
  client: SupabaseClient<Database>,
  playerId: string,
): Promise<EquipmentProfile | null> {
  const { data, error } = await client
    .from('equipment_profile')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface UpsertEquipmentProfileInput {
  playerId: string;
  frame: string | null;
  string: string | null;
  tensionMainsKg: number;
  tensionCrossesKg: number;
  framesCarried: number;
  restringCadence: RestringCadence;
  overgrip: string | null;
  practiceBalls: string[];
  stampSwitch: boolean;
}

// CE-15: "saving it triggers a re-run of every current brief" — this
// function only writes the profile row itself (bumping version, which lets
// a brief be read back against the profile that produced it); the caller
// (apps/web's Equipment pane) is responsible for triggering the re-run
// through the API, the same "the DB write and the side effect are two
// separate calls" shape saveNote/updateNoteContent already use.
export async function upsertEquipmentProfile(
  client: SupabaseClient<Database>,
  input: UpsertEquipmentProfileInput,
): Promise<EquipmentProfile> {
  const existing = await getEquipmentProfile(client, input.playerId);
  const { data, error } = await client
    .from('equipment_profile')
    .upsert(
      {
        player_id: input.playerId,
        frame: input.frame,
        string: input.string,
        tension_mains_kg: input.tensionMainsKg,
        tension_crosses_kg: input.tensionCrossesKg,
        frames_carried: input.framesCarried,
        restring_cadence: input.restringCadence,
        overgrip: input.overgrip,
        practice_balls: input.practiceBalls as unknown as Json,
        stamp_switch: input.stampSwitch,
        version: (existing?.version ?? 0) + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
