import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { PgBoss } from 'pg-boss';
import type { AgentRunsDb, ProviderState } from '@procircuit/actions';
import { registerAgentWorker, type AgentJobData } from '@procircuit/actions/queue';
import { TOURNAMENT_AGENT_NAME, runTournamentAgent, type TournamentRunLogger } from './run';
import { registerTournamentScheduler, type TournamentSchedulerLogger } from './scheduler';

// No model call this step (see run.ts's own comment), so this agent depends
// on no external provider at all — the pause/provider-switch pickup guard
// (packages/actions' evaluatePickup) is still exercised for the schedule
// pause itself, just with an empty provider list.
const REQUIRED_PROVIDERS: readonly string[] = [];

async function getAgentPaused(
  db: SupabaseClient<Database>,
  agentName: string,
  playerId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('agent_schedules')
    .select('paused')
    .eq('agent_name', agentName)
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw error;
  return data?.paused ?? false;
}

async function getProviderStates(
  db: SupabaseClient<Database>,
  providers: readonly string[],
): Promise<Record<string, ProviderState>> {
  const states: Record<string, ProviderState> = {};
  for (const provider of providers) {
    const { data, error } = await db
      .from('provider_switches')
      .select('state')
      .eq('provider', provider)
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    states[provider] = (data?.state as ProviderState | undefined) ?? 'on';
  }
  return states;
}

export interface TournamentAgentDeps {
  db: SupabaseClient<Database>;
  agentRuns: AgentRunsDb;
  logger?: TournamentRunLogger & TournamentSchedulerLogger;
}

// Registers both halves of the Tournament Agent's scheduled-run
// infrastructure on the shared AGENT_RUN_QUEUE pg-boss instance (the
// actionsBoss in apps/api/src/index.ts), the same shape as
// financial/worker.ts and mindset-coach/worker.ts: the hourly scheduler
// tick (Sunday 20:00 UTC only) and the queue worker that actually runs a
// job, with its pause/provider-switch pickup guard and 5/20/60 minute retry
// schedule (step 0.6).
export async function registerTournamentAgent(
  boss: PgBoss,
  deps: TournamentAgentDeps,
): Promise<void> {
  const logger = deps.logger ?? console;
  await registerTournamentScheduler(boss, { db: deps.db, logger });

  await registerAgentWorker(boss, {
    getAgentPaused: (agentName, playerId) => getAgentPaused(deps.db, agentName, playerId),
    getProviderStates: (providers) => getProviderStates(deps.db, providers),
    requiredProviders: REQUIRED_PROVIDERS,
    runAgent: async (job: AgentJobData) => {
      if (job.agentName !== TOURNAMENT_AGENT_NAME) return;
      await runTournamentAgent(
        { db: deps.db, agentRuns: deps.agentRuns, logger },
        job.playerId,
        job.triggerType,
      );
    },
    onSkippedPaused: async (job, cause) => {
      logger.error(`[tournament] skipped (paused) for player ${job.playerId}:`, cause);
    },
    onRetriesExhausted: async (job, error) => {
      logger.error(
        `[tournament] retries exhausted for player ${job.playerId} (window ${job.scheduledWindow}):`,
        error,
      );
    },
  });
}
