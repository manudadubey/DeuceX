import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { PgBoss } from 'pg-boss';
import type { ProviderState } from '@procircuit/actions';
import type { AgentRunsDb } from '@procircuit/actions';
import { enqueueAgentRun, registerAgentWorker, type AgentJobData } from '@procircuit/actions/queue';
import type { FinancialActionModelClient } from '@procircuit/agents';
import {
  FINANCIAL_AGENT_NAME,
  registerFinancialScheduler,
  type FinancialSchedulerLogger,
} from './scheduler';
import { runFinancialAgent, type FinancialRunLogger } from './run';

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
    states[provider] = (data?.state as ProviderState | undefined) ?? 'on';
  }
  return states;
}

export interface FinancialAgentDeps {
  db: SupabaseClient<Database>;
  client: FinancialActionModelClient;
  agentRuns: AgentRunsDb;
  logger?: FinancialRunLogger & FinancialSchedulerLogger;
}

// Registers both halves of the Financial Agent's scheduled-run
// infrastructure on the shared AGENT_RUN_QUEUE pg-boss instance, the same
// shape as mindset-coach/worker.ts: the hourly scheduler tick (07:00 UTC
// only) and the queue worker that actually runs a job, with its
// pause/provider-switch pickup guard and 5/20/60 minute retry schedule.
export async function registerFinancialAgent(
  boss: PgBoss,
  deps: FinancialAgentDeps,
): Promise<void> {
  const logger = deps.logger ?? console;
  await registerFinancialScheduler(boss, { db: deps.db, logger });

  await registerAgentWorker(boss, {
    getAgentPaused: (agentName, playerId) => getAgentPaused(deps.db, agentName, playerId),
    getProviderStates: (providers) => getProviderStates(deps.db, providers),
    requiredProviders: REQUIRED_PROVIDERS,
    runAgent: async (job: AgentJobData) => {
      if (job.agentName !== FINANCIAL_AGENT_NAME) return;
      await runFinancialAgent(
        { db: deps.db, client: deps.client, agentRuns: deps.agentRuns, logger },
        job.playerId,
        job.triggerType,
      );
    },
    onSkippedPaused: async (job, cause) => {
      logger.error(`[financial] skipped (paused) for player ${job.playerId}:`, cause);
    },
    onRetriesExhausted: async (job, error) => {
      logger.error(
        `[financial] retries exhausted for player ${job.playerId} (window ${job.scheduledWindow}):`,
        error,
      );
    },
  });
}

// F-1: "Also immediately on every saved expense..., every balance update
// and every receivable marked received." Those writes happen as plain
// client-side Supabase calls from apps/web (packages/db's insertLedgerLine,
// enterReserveBalance, the receivable-received gate), which never touch
// this queue directly — apps/web calls the /financial/recompute route
// (routes.ts) right after, which just calls this. scheduledWindow is
// rounded to the current minute, not a full timestamp: the idempotency key
// (agent_name, player_id, scheduled_window) is what collapses a burst of
// saves in the same minute into one run rather than a job per save.
export async function enqueueFinancialRecompute(
  boss: PgBoss,
  playerId: string,
  now: Date = new Date(),
): Promise<void> {
  await enqueueAgentRun(boss, {
    agentName: FINANCIAL_AGENT_NAME,
    playerId,
    scheduledWindow: now.toISOString().slice(0, 16),
    triggerType: 'event',
  });
}
