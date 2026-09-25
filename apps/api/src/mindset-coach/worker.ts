import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { PgBoss } from 'pg-boss';
import type { AgentRunsDb } from '@deucex/actions';
import type { AgentHandler } from '../agent-dispatcher';
import type { InsightModelClient } from '@deucex/agents';
import {
  MINDSET_AGENT_NAME,
  registerMindsetScheduler,
  type MindsetSchedulerLogger,
} from './scheduler';
import { runMindsetCoach, type MindsetRunLogger } from './run';

// The provider names TECH-ARCHITECTURE.md 2.4's provider_switches rows are
// keyed by; mindset-coach depends only on the one model vendor call.
const REQUIRED_PROVIDERS = ['openai'] as const;

export interface MindsetCoachDeps {
  db: SupabaseClient<Database>;
  client: InsightModelClient;
  agentRuns: AgentRunsDb;
  logger?: MindsetRunLogger & MindsetSchedulerLogger;
}

// Registers the Mindset Coach's hourly scheduler tick (scheduler.ts), which
// decides when a player is due, and returns the handler the shared
// AGENT_RUN_QUEUE dispatcher (../agent-dispatcher.ts, step 5.1) runs a job
// with; the pause/provider-switch pickup guard and 5/20/60 minute retries
// (packages/actions, step 0.6) live in the dispatcher.
export async function registerMindsetCoach(
  boss: PgBoss,
  deps: MindsetCoachDeps,
): Promise<AgentHandler> {
  const logger = deps.logger ?? console;
  await registerMindsetScheduler(boss, { db: deps.db, logger });

  return {
    agentName: MINDSET_AGENT_NAME,
    label: 'The Mindset Coach',
    requiredProviders: REQUIRED_PROVIDERS,
    run: async (job) => {
      await runMindsetCoach(
        { db: deps.db, client: deps.client, agentRuns: deps.agentRuns, logger },
        job.playerId,
      );
    },
  };
}
