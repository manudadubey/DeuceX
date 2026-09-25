import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import {
  climateNormalFor,
  computeConditionsBriefRules,
  type ConditionsBriefRules,
  type EquipmentProfileInput,
  type PreviousStampedEventInput,
  type TournamentFactSheetInput,
  type VenueForecastInput,
} from '@deucex/agents';
import type { WeatherAdapter } from './adapter';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

// PRD-08 section 4.5's own stated example values — a sensible starting
// profile for a player who hasn't saved one in Settings > Equipment yet, so
// a brief can still render (CE-1: "every shortlisted event carries a brief")
// rather than blocking on a profile that doesn't exist yet.
export const DEFAULT_EQUIPMENT: EquipmentProfileInput = {
  mainsKg: 24,
  crossesKg: 23,
  framesCarried: 4,
  practiceBalls: ['Dunlop Fort'],
  version: 0,
};

export async function loadEquipmentProfileInput(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<EquipmentProfileInput> {
  const { data, error } = await db
    .from('equipment_profile')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_EQUIPMENT;
  return {
    mainsKg: data.tension_mains_kg,
    crossesKg: data.tension_crosses_kg,
    framesCarried: data.frames_carried,
    practiceBalls: Array.isArray(data.practice_balls) ? (data.practice_balls as string[]) : [],
    version: data.version,
  };
}

export function tournamentFactSheet(tournament: TournamentRow): TournamentFactSheetInput {
  return {
    tournamentId: tournament.id,
    name: tournament.name,
    surface: tournament.surface,
    indoorOutdoor: tournament.indoor_outdoor as 'indoor' | 'outdoor' | null,
    city: tournament.city,
    altitudeM: tournament.altitude_m,
    ball: tournament.ball,
  };
}

// PRD-08 section 3: the forecast is fetched for the tournament's own match
// days; CE-19's fallback fires both when the venue has no coordinates yet
// and when the provider itself returns nothing (beyond its ~16-day horizon,
// or down) — either way this always returns a usable forecast, never null,
// so the rest of the brief can render regardless (CE-AC-13).
export async function fetchForecastOrNormals(
  weatherAdapter: WeatherAdapter,
  tournament: TournamentRow,
  now: Date,
): Promise<VenueForecastInput> {
  if (tournament.lat !== null && tournament.lon !== null) {
    const result = await weatherAdapter.fetchForecast({
      lat: tournament.lat,
      lon: tournament.lon,
      startDate: tournament.start_date,
      endDate: tournament.end_date,
    });
    if (result) {
      return { ...result, source: 'open-meteo', refreshed: true, fetchedAt: now.toISOString() };
    }
  }

  const monthIndex1To12 = new Date(`${tournament.start_date}T00:00:00Z`).getUTCMonth() + 1;
  const normal = climateNormalFor(tournament.lat, monthIndex1To12);
  return {
    tempMaxC: normal.tempMaxC,
    tempMinC: normal.tempMinC,
    rhMinPct: normal.rhMinPct,
    rhMaxPct: normal.rhMaxPct,
    windMinKmh: null,
    windMaxKmh: null,
    source: 'climate-normals',
    refreshed: false,
    fetchedAt: now.toISOString(),
  };
}

// CE-6's "most recent stamped event" comparison point — the newest saved
// Match note carrying a real stamp (stamp.ts's own string[] shape), across
// any tournament, not scoped to the one this brief is for.
export async function loadPreviousStampedEvent(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<PreviousStampedEventInput | null> {
  const { data, error } = await db
    .from('notes')
    .select('cond')
    .eq('player_id', playerId)
    .eq('status', 'saved')
    .not('cond', 'is', null)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.cond || !Array.isArray(data.cond)) return null;

  const chips = data.cond as string[];
  const tempMaxC = Number.parseFloat(chips[0] ?? '');
  const ball = chips[3] ?? null;
  const place = chips[4] ?? null;
  if (Number.isNaN(tempMaxC) || !place) return null;

  return { place, tempMaxC, ball: ball === 'Ball not published yet' ? null : ball };
}

export interface ComputedBrief {
  tournamentId: string;
  name: string;
  city: string | null;
  rules: ConditionsBriefRules;
  previousEvent: PreviousStampedEventInput | null;
}

export async function computeBriefForTournament(
  weatherAdapter: WeatherAdapter,
  tournament: TournamentRow,
  equipment: EquipmentProfileInput,
  previousEvent: PreviousStampedEventInput | null,
  now: Date,
): Promise<ComputedBrief> {
  const forecast = await fetchForecastOrNormals(weatherAdapter, tournament, now);
  const rules = computeConditionsBriefRules({
    tournament: tournamentFactSheet(tournament),
    forecast,
    equipment,
    previousEvent,
  });
  return {
    tournamentId: tournament.id,
    name: tournament.name,
    city: tournament.city,
    rules,
    previousEvent,
  };
}
