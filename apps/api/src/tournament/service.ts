import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { convertAtRate, getFxRates } from '@deucex/db';
import { parseBlockedDateRanges, type TournamentCandidateInput } from '@deucex/agents';
import { isInStageScope, type PlayerStage, type PlayerTour } from './stage-scope';

const SCAN_WEEKS_AHEAD = 8;

// tournaments.prize_table (step 3.1) carries no currency column of its own;
// this is the one place that convention is decided. EUR mirrors
// fx_rates_daily's own ECB-archive currency (TECH-ARCHITECTURE.md section
// 2.1), so every prize/points table this module reads is assumed EUR-
// denominated at the source and converted to the player's home currency at
// run time (PRD-01 section 7: "converted to home currency at the run-date
// rate, shown as such"), the same never-store-a-converted-amount discipline
// the rest of the money model already follows.
const PRIZE_TABLE_SOURCE_CURRENCY = 'EUR';

export interface TournamentPlayer {
  id: string;
  tour: PlayerTour;
  homeCurrency: string;
  weeklyBudget: number | null;
  blockedDates: string | null;
  stage: PlayerStage;
  tourRank: number | null;
  itfRank: number | null;
  homeAirport: string | null;
  coachWeeklyFee: number;
  coachTravels: boolean;
  tier: string | null;
}

export async function loadTournamentPlayer(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<TournamentPlayer | null> {
  const { data, error } = await db
    .from('players')
    .select(
      'id, tour, home_currency, weekly_budget, blocked_dates, stage, tour_rank, itf_rank, home_airport, coach_weekly_fee, coach_travels, tier',
    )
    .eq('id', playerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const stage: PlayerStage =
    data.stage === '1' || data.stage === '2' || data.stage === '3' ? data.stage : '1';
  return {
    id: data.id,
    tour: data.tour === 'wta' ? 'wta' : 'atp',
    homeCurrency: data.home_currency,
    weeklyBudget: data.weekly_budget,
    blockedDates: data.blocked_dates,
    stage,
    tourRank: data.tour_rank,
    itfRank: data.itf_rank,
    homeAirport: data.home_airport,
    coachWeeklyFee: data.coach_weekly_fee ?? 0,
    coachTravels: data.coach_travels,
    tier: data.tier,
  };
}

interface PointsByTournamentEntry {
  tournamentId: string;
  event: 'singles' | 'doubles';
  points: number;
  expiryWeek: string;
}

// TECH-ARCHITECTURE.md section 2.2's own description of this jsonb column
// ("tournament id, event singles or doubles, points, expiry week"); no
// ranking import path writes it yet (step 3.1's CSV import only carries
// singles/doubles rank and points totals, not a per-event breakdown), so
// this reads real rows once a future step starts writing them and simply
// finds nothing today — T-4's defence-week detection degrades to "no
// defence week found" rather than guessing, the same "not yet, documented"
// idiom the Financial Agent's patronMrr=0 stub already uses.
async function loadDefendPoints(
  db: SupabaseClient<Database>,
  playerId: string,
  tournamentId: string,
  weekStart: string,
): Promise<number | null> {
  const { data, error } = await db
    .from('ranking_snapshots')
    .select('points_by_tournament')
    .eq('player_id', playerId)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const entries = (data.points_by_tournament as unknown as PointsByTournamentEntry[]) ?? [];
  const match = entries.find(
    (e) => e.tournamentId === tournamentId && e.event === 'singles' && e.expiryWeek === weekStart,
  );
  return match?.points ?? null;
}

export interface LoadCandidatesResult {
  candidates: TournamentCandidateInput[];
  blockedDateRanges: { start: string; end: string }[];
}

// T-1: "scans every event in the player's stage scope whose first day falls
// within the next eight weeks and whose entry deadline has not passed."
export async function loadTournamentCandidates(
  db: SupabaseClient<Database>,
  player: TournamentPlayer,
  now: Date = new Date(),
): Promise<LoadCandidatesResult> {
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + SCAN_WEEKS_AHEAD * 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await db
    .from('tournaments')
    .select('*')
    .gte('start_date', today)
    .lte('start_date', horizon)
    .order('start_date', { ascending: true });
  if (error) throw error;

  const inScope = (data ?? []).filter((t) =>
    isInStageScope(player.tour, player.stage, {
      tour: t.tour as 'atp' | 'wta' | 'itf_men' | 'itf_women',
      tier: t.tier,
    }),
  );
  const notPastDeadline = inScope.filter((t) => !t.entry_deadline || t.entry_deadline >= today);

  const rates =
    player.homeCurrency === PRIZE_TABLE_SOURCE_CURRENCY
      ? {}
      : Object.fromEntries(
          Object.entries(await getFxRates(db, today, [player.homeCurrency])).map(([c, r]) => [
            c,
            r.rateToEur,
          ]),
        );

  const candidates = await Promise.all(
    notPastDeadline.map(async (t): Promise<TournamentCandidateInput> => {
      const rawPrizeTable = (t.prize_table as unknown as Record<string, number>) ?? {};
      const rawPointsTable = (t.points_table as unknown as Record<string, number>) ?? {};
      const prizeTable = Object.fromEntries(
        Object.entries(rawPrizeTable).map(([round, amount]) => [
          round,
          convertAtRate(amount, PRIZE_TABLE_SOURCE_CURRENCY, player.homeCurrency, rates),
        ]),
      );
      const weekStart = mondayOf(t.start_date);
      const rankingPosition = t.tour.startsWith('itf') ? player.itfRank : player.tourRank;
      const defendPoints = await loadDefendPoints(db, player.id, t.id, weekStart);

      return {
        tournamentId: t.id,
        name: t.name,
        tier: t.tier,
        surface: t.surface,
        city: t.city,
        country: t.country,
        startDate: t.start_date,
        endDate: t.end_date,
        entryDeadline: t.entry_deadline,
        weekStart,
        entryFee: 0, // no fee field on tournaments yet; T-5's "Entry fee when non-zero" stays 0 until one exists
        hasQualifying: true, // every tier in scope realistically has a qualifying draw; refined once a real feed carries this per event
        lastYearCut: t.last_year_cut,
        rankingPosition,
        prizeTable,
        pointsTable: rawPointsTable,
        defendPoints,
        defendPlacesAtRisk: null, // PRD-01 section 7's "computed from the current ranking table" needs a full ranking distribution this step does not have; see design note in docs/BUILD-LOG.md
      };
    }),
  );

  return {
    candidates,
    blockedDateRanges: parseBlockedDateRanges(player.blockedDates, now),
  };
}

function mondayOf(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // ISO week starts Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}
