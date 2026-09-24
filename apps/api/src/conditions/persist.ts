import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { ConditionsBriefRules } from '@procircuit/agents';

export interface PersistBriefInput {
  playerId: string;
  tournamentId: string;
  runId: string | null;
  rules: ConditionsBriefRules;
  diff: string;
  practice: string;
  equipmentVersion: number;
  forecastAt: string;
}

// One row per (player_id, tournament_id) — see the step 3.3 migration's own
// design note, the same upsert shape as tournament/run.ts's
// persistShortlist for shortlist_candidates.
export async function persistConditionsBrief(
  db: SupabaseClient<Database>,
  input: PersistBriefInput,
): Promise<void> {
  const { rules } = input;
  const { error } = await db.from('conditions_briefs').upsert(
    {
      player_id: input.playerId,
      tournament_id: input.tournamentId,
      run_id: input.runId,
      temp_range: rules.tempRange,
      temp_max: rules.tempMax,
      rh_range: rules.rhRange,
      rh_max: rules.rhMax,
      wind: rules.wind,
      altitude_m: rules.altitudeM,
      ball: rules.ball,
      ball_diff: rules.ballDiff,
      io: rules.io,
      diff: input.diff,
      tension: rules.tension,
      tension_note: rules.tensionNote,
      test_mains: rules.testMains,
      test_crosses: rules.testCrosses,
      frames: rules.frames,
      frames_sub_line: rules.framesSubLine,
      grip: rules.grip,
      practice: input.practice,
      forecast_at: input.forecastAt,
      forecast_source: rules.forecastSource,
      refreshed: rules.refreshed,
      equipment_version: input.equipmentVersion,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'player_id,tournament_id' },
  );
  if (error) throw error;
}
