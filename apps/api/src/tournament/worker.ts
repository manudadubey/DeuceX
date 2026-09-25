import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { PgBoss } from 'pg-boss';
import type { AgentRunsDb } from '@deucex/actions';
import type { ProseModelClient } from '@deucex/agents';
import type { AgentHandler } from '../agent-dispatcher';
import { TOURNAMENT_AGENT_NAME, runTournamentAgent, type TournamentRunLogger } from './run';
import { registerTournamentScheduler, type TournamentSchedulerLogger } from './scheduler';
import type { WeatherAdapter } from '../conditions/adapter';

// No model call this step (see run.ts's own comment), so this agent depends
// on no external provider at all — the pause/provider-switch pickup guard
// (packages/actions' evaluatePickup) is still exercised for the schedule
// pause itself, just with an empty provider list.
const REQUIRED_PROVIDERS: readonly string[] = [];

export interface TournamentAgentDeps {
  db: SupabaseClient<Database>;
  agentRuns: AgentRunsDb;
  weatherAdapter: WeatherAdapter;
  proseClient: ProseModelClient;
  logger?: TournamentRunLogger & TournamentSchedulerLogger;
}

// Registers the Tournament Agent's hourly scheduler tick (Sunday 20:00 UTC
// only) and returns its handler for the shared AGENT_RUN_QUEUE dispatcher
// (../agent-dispatcher.ts, step 5.1), same shape as mindset-coach/worker.ts.
export async function registerTournamentAgent(
  boss: PgBoss,
  deps: TournamentAgentDeps,
): Promise<AgentHandler> {
  const logger = deps.logger ?? console;
  await registerTournamentScheduler(boss, { db: deps.db, logger });

  return {
    agentName: TOURNAMENT_AGENT_NAME,
    label: 'The Tournament Agent',
    requiredProviders: REQUIRED_PROVIDERS,
    run: async (job) => {
      await runTournamentAgent(
        {
          db: deps.db,
          agentRuns: deps.agentRuns,
          weatherAdapter: deps.weatherAdapter,
          proseClient: deps.proseClient,
          logger,
        },
        job.playerId,
        job.triggerType,
      );
    },
  };
}
