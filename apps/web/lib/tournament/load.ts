import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { CostBreakdown, RoundOutcome } from '@procircuit/agents';
import { loadFinancialSnapshot } from '@/lib/financial/load';

// PRD-08 section 6's brief, read straight off conditions_briefs (system-
// computed, same "read live and directly from the player's own rows on
// every load" idiom loadTournamentSnapshot already uses for everything
// else on this page).
export interface ConditionsBriefView {
  tempRange: string;
  tempMax: number;
  rhRange: string;
  rhMax: number;
  wind: string;
  altitudeM: number | null;
  ball: string | null;
  ballDiff: boolean;
  io: string;
  diff: string;
  tension: boolean;
  tensionNote: string;
  testMains: number | null;
  testCrosses: number | null;
  frames: number;
  framesSubLine: string;
  grip: string;
  practice: string;
  refreshed: boolean;
  forecastSource: string;
}

export interface TournamentCandidateView {
  tournamentId: string;
  rank: number;
  name: string;
  tier: string | null;
  surface: string | null;
  city: string | null;
  country: string | null;
  startDate: string;
  endDate: string;
  entryDeadline: string | null;
  weekStart: string;
  ratio: number;
  cost: CostBreakdown;
  rounds: RoundOutcome[];
  exp: number;
  lo: number;
  hi: number;
  acceptanceStatus: string;
  defendPoints: number | null;
  why: string;
  current: boolean;
  status: 'none' | 'entered' | 'skipped' | 'withdrawn';
  plannedExpenseId: string | null;
  conditions: ConditionsBriefView | null;
}

interface CachedRunOutput {
  scannedCount: number;
  excluded: { tournamentId: string; name: string; reason: string }[];
}

export interface TournamentSnapshot {
  homeCurrency: string;
  weeklyBudget: number | null;
  candidates: TournamentCandidateView[];
  scannedCount: number;
  excluded: CachedRunOutput['excluded'];
  reserves: number;
  netBurn: number;
  /** Equipment profile baseline (PRD-08 section 4.5's own defaults when the player hasn't saved one yet). */
  equipmentMainsKg: number;
  equipmentCrossesKg: number;
}

const DEFAULT_EQUIPMENT_MAINS_KG = 24;
const DEFAULT_EQUIPMENT_CROSSES_KG = 23;

function daysUntil(dateIso: string | null, now: Date): number | null {
  if (!dateIso) return null;
  const ms =
    new Date(`${dateIso}T00:00:00Z`).getTime() - new Date(now.toISOString().slice(0, 10)).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export { daysUntil };

// The Tournament Agent page's own read, mirroring
// apps/web/lib/financial/load.ts's own split exactly: every number
// (ratio, cost, outcome rows, decision status) is read live and directly
// from the player's own RLS-scoped rows on every load, not recomputed here
// — only shortlist_candidates/entry_decisions themselves are the scheduled
// run's write, and scannedCount/excluded (informational only, never a
// number the player acts on) are read from the latest succeeded
// agent_runs.output rather than recomputed, the same "only the phrased
// sentence needs the run" idiom the Financial Agent already established.
export async function loadTournamentSnapshot(
  supabase: SupabaseClient<Database>,
  playerId: string,
  homeCurrency: string,
  weeklyBudget: number | null,
  now: Date = new Date(),
): Promise<TournamentSnapshot> {
  const [candidatesRes, decisionsRes, runRes, equipmentRes] = await Promise.all([
    supabase
      .from('shortlist_candidates')
      .select('*')
      .eq('player_id', playerId)
      .order('rank', { ascending: true }),
    supabase.from('entry_decisions').select('*').eq('player_id', playerId),
    supabase
      .from('agent_runs')
      .select('output')
      .eq('player_id', playerId)
      .eq('agent_name', 'tournament')
      .eq('status', 'succeeded')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('equipment_profile')
      .select('tension_mains_kg, tension_crosses_kg')
      .eq('player_id', playerId)
      .maybeSingle(),
  ]);
  if (candidatesRes.error) throw candidatesRes.error;
  if (decisionsRes.error) throw decisionsRes.error;
  if (runRes.error) throw runRes.error;
  if (equipmentRes.error) throw equipmentRes.error;

  const candidateRows = candidatesRes.data ?? [];
  const tournamentIds = candidateRows.map((c) => c.tournament_id);
  const [tournamentsRes, conditionsRes] = tournamentIds.length
    ? await Promise.all([
        supabase.from('tournaments').select('*').in('id', tournamentIds),
        supabase
          .from('conditions_briefs')
          .select('*')
          .eq('player_id', playerId)
          .in('tournament_id', tournamentIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (tournamentsRes.error) throw tournamentsRes.error;
  if (conditionsRes.error) throw conditionsRes.error;

  const tournamentById = new Map((tournamentsRes.data ?? []).map((t) => [t.id, t]));
  const decisionByTournament = new Map((decisionsRes.data ?? []).map((d) => [d.tournament_id, d]));
  const conditionsByTournament = new Map(
    (conditionsRes.data ?? []).map((c) => [c.tournament_id, c]),
  );

  function mondayOf(dateIso: string): string {
    const date = new Date(`${dateIso}T00:00:00Z`);
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setUTCDate(date.getUTCDate() + diff);
    return date.toISOString().slice(0, 10);
  }

  const candidates: TournamentCandidateView[] = candidateRows.map((c) => {
    const tournament = tournamentById.get(c.tournament_id);
    const decision = decisionByTournament.get(c.tournament_id);
    const conditions = conditionsByTournament.get(c.tournament_id);
    return {
      tournamentId: c.tournament_id,
      rank: c.rank,
      name: tournament?.name ?? 'Unknown event',
      tier: tournament?.tier ?? null,
      surface: tournament?.surface ?? null,
      city: tournament?.city ?? null,
      country: tournament?.country ?? null,
      startDate: tournament?.start_date ?? '',
      endDate: tournament?.end_date ?? '',
      entryDeadline: tournament?.entry_deadline ?? null,
      weekStart: tournament ? mondayOf(tournament.start_date) : '',
      ratio: c.ratio,
      cost: c.cost as unknown as CostBreakdown,
      rounds: (c.rounds as unknown as RoundOutcome[]) ?? [],
      exp: c.exp,
      lo: c.lo,
      hi: c.hi,
      acceptanceStatus: c.acceptance_status,
      defendPoints: c.defend_points,
      why: c.why,
      current: c.current,
      status: (decision?.status ?? 'none') as TournamentCandidateView['status'],
      plannedExpenseId: decision?.planned_expense_id ?? null,
      conditions: conditions
        ? {
            tempRange: conditions.temp_range,
            tempMax: conditions.temp_max,
            rhRange: conditions.rh_range,
            rhMax: conditions.rh_max,
            wind: conditions.wind,
            altitudeM: conditions.altitude_m,
            ball: conditions.ball,
            ballDiff: conditions.ball_diff,
            io: conditions.io,
            diff: conditions.diff,
            tension: conditions.tension,
            tensionNote: conditions.tension_note,
            testMains: conditions.test_mains,
            testCrosses: conditions.test_crosses,
            frames: conditions.frames,
            framesSubLine: conditions.frames_sub_line,
            grip: conditions.grip,
            practice: conditions.practice,
            refreshed: conditions.refreshed,
            forecastSource: conditions.forecast_source,
          }
        : null,
    };
  });

  const cached = runRes.data?.output as unknown as CachedRunOutput | undefined;
  const financial = await loadFinancialSnapshot(
    supabase,
    playerId,
    homeCurrency,
    weeklyBudget,
    now,
  );

  return {
    homeCurrency,
    weeklyBudget,
    candidates,
    scannedCount: cached?.scannedCount ?? 0,
    excluded: cached?.excluded ?? [],
    reserves: financial.reserves,
    netBurn: financial.netBurn,
    equipmentMainsKg: equipmentRes.data?.tension_mains_kg ?? DEFAULT_EQUIPMENT_MAINS_KG,
    equipmentCrossesKg: equipmentRes.data?.tension_crosses_kg ?? DEFAULT_EQUIPMENT_CROSSES_KG,
  };
}
