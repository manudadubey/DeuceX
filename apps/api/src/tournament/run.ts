import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@procircuit/db';
import { recordRun, type AgentRunsDb, type AgentRunTriggerType } from '@procircuit/actions';
import {
  buildShortlist,
  type CostModelPlayer,
  type ShortlistFilters,
  type ShortlistResult,
  type ProseModelClient,
} from '@procircuit/agents';
import { loadTournamentCandidates, loadTournamentPlayer } from './service';
import { runConditionsForCandidates } from '../conditions/run';
import type { WeatherAdapter } from '../conditions/adapter';

export const TOURNAMENT_AGENT_NAME = 'tournament';
export const TOURNAMENT_SCHEMA_VERSION = 'v1';
// No model call this step (see docs/BUILD-LOG.md's step 3.2 entry): the
// whole shortlist — ranking, cost, why-text — is deterministic. 'model'
// still has to be a non-empty string for agent_runs' own NOT NULL column,
// so this names what actually ran instead of a vendor model id.
export const TOURNAMENT_MODEL = 'deterministic-v1';

export interface TournamentRunLogger {
  error(...args: unknown[]): void;
}

export interface TournamentRunDeps {
  db: SupabaseClient<Database>;
  agentRuns: AgentRunsDb;
  // PRD-08 section 3: "runs inside every Tournament Agent run" — the
  // Conditions layer's own weather adapter and prose model client, threaded
  // through from apps/api/src/index.ts the same way as everything else this
  // run needs, rather than conditions/run.ts reaching for its own globals.
  weatherAdapter: WeatherAdapter;
  proseClient: ProseModelClient;
  logger?: TournamentRunLogger;
}

function inputsHashFor(candidates: unknown, filters: unknown, player: unknown): string {
  return createHash('sha256').update(JSON.stringify({ candidates, filters, player })).digest('hex');
}

async function persistShortlist(
  db: SupabaseClient<Database>,
  playerId: string,
  result: ShortlistResult,
  runId: string | null,
  now: Date,
): Promise<void> {
  const currentTournamentIds = result.candidates.map((c) => c.tournamentId);

  // T-14: a re-run may re-rank but never clears a decision, and a
  // shortlisted event a later run would exclude stays visible with its
  // decision and an "excluded next week" note — so a candidate no longer in
  // this run's output is marked current=false rather than deleted, and its
  // entry_decisions row (if any) is left untouched.
  let demoteQuery = db
    .from('shortlist_candidates')
    .update({ current: false, updated_at: now.toISOString() })
    .eq('player_id', playerId)
    .eq('current', true);
  if (currentTournamentIds.length > 0) {
    demoteQuery = demoteQuery.not('tournament_id', 'in', `(${currentTournamentIds.join(',')})`);
  }
  const { error: demoteError } = await demoteQuery;
  if (demoteError) throw demoteError;

  for (const candidate of result.candidates) {
    const { error: upsertError } = await db.from('shortlist_candidates').upsert(
      {
        player_id: playerId,
        tournament_id: candidate.tournamentId,
        run_id: runId,
        rank: candidate.rank,
        ratio: candidate.ratio,
        cost: candidate.cost as unknown as Json,
        rounds: candidate.rounds as unknown as Json,
        exp: candidate.exp,
        lo: candidate.lo,
        hi: candidate.hi,
        acceptance_status: candidate.acceptanceStatus,
        defend_points: candidate.defendPoints,
        why: candidate.why,
        current: true,
        updated_at: now.toISOString(),
      },
      { onConflict: 'player_id,tournament_id' },
    );
    if (upsertError) throw upsertError;

    // Created once, before the player ever sees it (see the step 3.2
    // migration's design note): a conflict here just means the row already
    // exists from an earlier run, which is fine — status is never touched
    // by this upsert.
    const { error: decisionError } = await db
      .from('entry_decisions')
      .upsert(
        { player_id: playerId, tournament_id: candidate.tournamentId },
        { onConflict: 'player_id,tournament_id', ignoreDuplicates: true },
      );
    if (decisionError) throw decisionError;
  }
}

async function findRunId(
  db: SupabaseClient<Database>,
  playerId: string,
  inputsHash: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('agent_runs')
    .select('id')
    .eq('player_id', playerId)
    .eq('agent_name', TOURNAMENT_AGENT_NAME)
    .eq('inputs_hash', inputsHash)
    .eq('status', 'succeeded')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

// PRD-01 section 9: exactly one notification per run — a For-you when a
// deadline falls inside the coming seven days, otherwise an FYI that the
// shortlist is ready (M-NOTIF-1).
async function sendShortlistNotification(
  db: SupabaseClient<Database>,
  playerId: string,
  result: ShortlistResult,
  now: Date,
): Promise<void> {
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const nearest = result.candidates
    .filter((c) => c.entryDeadline && c.entryDeadline >= now.toISOString().slice(0, 10))
    .sort((a, b) => (a.entryDeadline ?? '').localeCompare(b.entryDeadline ?? ''))[0];

  if (nearest?.entryDeadline && nearest.entryDeadline <= sevenDaysOut) {
    const { error } = await db.from('notifications').insert({
      player_id: playerId,
      agent: TOURNAMENT_AGENT_NAME,
      category: 'for_you',
      title: `${nearest.name} entry closes soon`,
      body: `Top pick of ${result.candidates.length}. Cost-to-prize ratio ${nearest.ratio.toFixed(2)}. Confirm or withdraw by ${nearest.entryDeadline}.`,
      action_href: '/agent/tournament',
    });
    if (error) throw error;
    return;
  }

  const { error } = await db.from('notifications').insert({
    player_id: playerId,
    agent: TOURNAMENT_AGENT_NAME,
    category: 'fyi',
    title: 'Weekly shortlist ready',
    body: `${result.scannedCount} events scanned, ${result.candidates.length} shortlisted.`,
    action_href: '/agent/tournament',
  });
  if (error) throw error;
}

// The scheduled-and-event Tournament Agent run (PRD-01 section 3): loads
// inputs, computes the shortlist deterministically (no model call this
// step), persists it, and — only on a real schedule trigger, matching
// M-NOTIF-1 — sends the one notification the run produces.
export async function runTournamentAgent(
  deps: TournamentRunDeps,
  playerId: string,
  triggerType: AgentRunTriggerType,
  now: Date = new Date(),
): Promise<ShortlistResult | null> {
  const logger = deps.logger ?? console;
  const player = await loadTournamentPlayer(deps.db, playerId);
  if (!player) return null;

  const { candidates: candidateInputs, blockedDateRanges } = await loadTournamentCandidates(
    deps.db,
    player,
    now,
  );
  const filters: ShortlistFilters = {
    weeklyBudget: player.weeklyBudget,
    blockedDateRanges,
    excludedSurfaces: [],
  };
  const costModelPlayer: CostModelPlayer = {
    homeAirport: player.homeAirport,
    coachWeeklyFee: player.coachWeeklyFee,
    coachTravels: player.coachTravels,
  };
  const inputsHash = inputsHashFor(candidateInputs, filters, costModelPlayer);

  try {
    const { output } = await recordRun(
      deps.agentRuns,
      {
        agentName: TOURNAMENT_AGENT_NAME,
        playerId,
        triggerType,
        inputsHash,
        model: TOURNAMENT_MODEL,
        promptVersion: '1',
        schemaVersion: TOURNAMENT_SCHEMA_VERSION,
      },
      async () => ({
        output: buildShortlist(candidateInputs, costModelPlayer, filters) as unknown as Json,
      }),
    );

    const result = output as unknown as ShortlistResult;
    const runId = await findRunId(deps.db, playerId, inputsHash);
    await persistShortlist(deps.db, playerId, result, runId, now);

    if (triggerType === 'schedule') {
      await sendShortlistNotification(deps.db, playerId, result, now);
    }

    // PRD-08 section 3: "runs inside every Tournament Agent run"; section
    // 3's own failure behaviour ("No failure blocks the Tournament Agent
    // run") is why this is its own try/catch rather than part of the block
    // above — a Conditions failure must never turn a successful shortlist
    // run into a failed one.
    try {
      const tournamentIds = result.candidates.map((c) => c.tournamentId);
      if (tournamentIds.length > 0) {
        const { data: tournamentRows, error: tournamentsError } = await deps.db
          .from('tournaments')
          .select('*')
          .in('id', tournamentIds);
        if (tournamentsError) throw tournamentsError;
        await runConditionsForCandidates(
          {
            db: deps.db,
            agentRuns: deps.agentRuns,
            weatherAdapter: deps.weatherAdapter,
            proseClient: deps.proseClient,
            logger,
          },
          playerId,
          tournamentRows ?? [],
          now,
        );
      }
    } catch (err) {
      logger.error(`[conditions] failed inside tournament run for player ${playerId}:`, err);
    }

    return result;
  } catch (err) {
    logger.error(`[tournament] run failed for player ${playerId}:`, err);
    throw err;
  }
}
