import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { PgBoss } from 'pg-boss';
import { registerAgentWorker, type AgentJobData, type ProviderState } from '@procircuit/actions';
import type { AgentRunsDb } from '@procircuit/actions';
import type { InsightModelClient } from '@procircuit/agents';
import {
  MINDSET_AGENT_NAME,
  registerMindsetScheduler,
  type MindsetSchedulerLogger,
} from './scheduler';
import { runMindsetCoach, type MindsetRunLogger } from './run';

// The provider names TECH-ARCHITECTURE.md 2.4's provider_switches rows are
// keyed by; mindset-coach depends only on the one model vendor call.
const REQUIRED_PROVIDERS = ['openai'] as const;

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
    // "A provider with no row yet is implicitly on" (TECH-ARCHITECTURE.md 2.4).
    states[provider] = (data?.state as ProviderState | undefined) ?? 'on';
  }
  return states;
}

export interface MindsetCoachDeps {
  db: SupabaseClient<Database>;
  client: InsightModelClient;
  agentRuns: AgentRunsDb;
  logger?: MindsetRunLogger & MindsetSchedulerLogger;
}

// Registers both halves of the Mindset Coach's scheduled-run infrastructure
// on one pg-boss instance: the hourly scheduler tick (scheduler.ts) that
// decides *when* a player is due, and the AGENT_RUN_QUEUE worker
// (packages/actions, step 0.6) that actually picks up and runs a job —
// mindset-coach is the first agent to exercise that queue's pause/provider-
// switch pickup guard and 5/20/60 minute retry schedule for real.
export async function registerMindsetCoach(boss: PgBoss, deps: MindsetCoachDeps): Promise<void> {
  const logger = deps.logger ?? console;
  await registerMindsetScheduler(boss, { db: deps.db, logger });

  await registerAgentWorker(boss, {
    getAgentPaused: (agentName, playerId) => getAgentPaused(deps.db, agentName, playerId),
    getProviderStates: (providers) => getProviderStates(deps.db, providers),
    requiredProviders: REQUIRED_PROVIDERS,
    runAgent: async (job: AgentJobData) => {
      if (job.agentName !== MINDSET_AGENT_NAME) return;
      await runMindsetCoach(
        { db: deps.db, client: deps.client, agentRuns: deps.agentRuns, logger },
        job.playerId,
      );
    },
    onSkippedPaused: async (job, cause) => {
      logger.error(`[mindset-coach] skipped (paused) for player ${job.playerId}:`, cause);
    },
    onRetriesExhausted: async (job, error) => {
      logger.error(
        `[mindset-coach] retries exhausted for player ${job.playerId} (window ${job.scheduledWindow}):`,
        error,
      );
    },
  });
}
