import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { buildStamp } from '@deucex/agents';
import type { WeatherAdapter } from './adapter';
import { tournamentFactSheet } from './compute';

export interface StampDeps {
  db: SupabaseClient<Database>;
  weatherAdapter: WeatherAdapter;
}

// CE-11: "Match notes saved during an Entered event while the stamp switch
// is on receive a stamp." Finds the Entered tournament (entry_decisions,
// step 3.2) whose date range covers the note's own recorded date — there is
// no itinerary or match-hour data to be more precise than "the day it was
// recorded" (PRD-08 section 12's own open question about reading a real
// itinerary is unresolved, same as the practice-hour rule's first-round-slot
// gap; see docs/BUILD-LOG.md's step 3.3 entry).
async function findEnteredTournamentForDate(
  db: SupabaseClient<Database>,
  playerId: string,
  dateIso: string,
) {
  const { data: decisions, error: decisionsError } = await db
    .from('entry_decisions')
    .select('tournament_id')
    .eq('player_id', playerId)
    .eq('status', 'entered');
  if (decisionsError) throw decisionsError;
  const tournamentIds = (decisions ?? []).map((d) => d.tournament_id);
  if (tournamentIds.length === 0) return null;

  const { data: tournaments, error: tournamentsError } = await db
    .from('tournaments')
    .select('*')
    .in('id', tournamentIds)
    .lte('start_date', dateIso)
    .gte('end_date', dateIso)
    .limit(1)
    .maybeSingle();
  if (tournamentsError) throw tournamentsError;
  return tournaments;
}

// CE-11/CE-19's failure behaviour: returns null whenever a stamp genuinely
// cannot be produced (switch off, no Entered event covering the date, no
// forecast for that single day, or the provider down) — the caller (notes
// service and the backfill sweep) both treat null as "leave the note
// unstamped," never as an error to surface to the player.
export async function computeNoteStamp(
  deps: StampDeps,
  playerId: string,
  recordedAt: string,
): Promise<string[] | null> {
  const { data: profile, error: profileError } = await deps.db
    .from('equipment_profile')
    .select('stamp_switch')
    .eq('player_id', playerId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (profile && profile.stamp_switch === false) return null;

  const dateIso = recordedAt.slice(0, 10);
  const tournament = await findEnteredTournamentForDate(deps.db, playerId, dateIso);
  if (!tournament || tournament.lat === null || tournament.lon === null) return null;

  const forecast = await deps.weatherAdapter.fetchForecast({
    lat: tournament.lat,
    lon: tournament.lon,
    startDate: dateIso,
    endDate: dateIso,
  });
  if (!forecast) return null;

  const fact = tournamentFactSheet(tournament);
  return buildStamp({
    tempC: forecast.tempMaxC,
    rhPct: forecast.rhMaxPct,
    indoorOutdoor: fact.indoorOutdoor,
    surface: fact.surface,
    ball: fact.ball,
    place: tournament.city,
  });
}
