import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { PgBoss } from 'pg-boss';
import { registerAgentWorker, type AgentJobData } from '@deucex/actions/queue';
import { createRunFailureHooks, getAgentPaused, getProviderStates } from './agent-controls';

export interface AgentHandler {
  agentName: string;
  /** How the player-facing "didn't complete" notice names the agent. */
  label: string;
  requiredProviders: readonly string[];
  run(job: AgentJobData): Promise<void>;
}

export interface DispatcherLogger {
  error(...args: unknown[]): void;
}

// One worker for the whole AGENT_RUN_QUEUE (step 5.1). Until this step
// each agent registered its own worker on the same queue and returned
// early on jobs for other agents, but pg-boss hands a job to whichever
// worker polls first, so a job could be completed by the wrong worker
// without running. Routing by agent name here fixes that, and gives every
// agent the same pause check (per player and global), provider switches
// and failure record (PRD-13 AD-14 to AD-16).
export async function registerAgentDispatcher(
  boss: PgBoss,
  db: SupabaseClient<Database>,
  handlers: readonly AgentHandler[],
  logger: DispatcherLogger = console,
): Promise<string> {
  const byName = new Map(handlers.map((h) => [h.agentName, h]));
  const hooksByName = new Map(
    handlers.map((h) => [h.agentName, createRunFailureHooks(db, h.label)]),
  );

  return registerAgentWorker(boss, {
    getAgentPaused: (agentName, playerId) => getAgentPaused(db, agentName, playerId),
    getProviderStates: (providers) => getProviderStates(db, providers),
    requiredProviders: (agentName) => byName.get(agentName)?.requiredProviders ?? [],
    runAgent: async (job) => {
      const handler = byName.get(job.agentName);
      if (!handler) throw new Error(`No handler registered for agent "${job.agentName}"`);
      await handler.run(job);
    },
    onSkippedPaused: async (job, cause) => {
      logger.error(`[${job.agentName}] skipped (paused) for player ${job.playerId}:`, cause);
    },
    onRetriesExhausted: async (job, error) => {
      logger.error(
        `[${job.agentName}] retries exhausted for player ${job.playerId} (window ${job.scheduledWindow}):`,
        error,
      );
    },
    onAttemptFailed: async (job, error, info) => {
      await hooksByName.get(job.agentName)?.onAttemptFailed?.(job, error, info);
    },
    onSucceeded: async (job) => {
      await hooksByName.get(job.agentName)?.onSucceeded?.(job);
    },
  });
}
