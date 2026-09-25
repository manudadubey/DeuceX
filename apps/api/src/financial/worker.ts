import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { PgBoss } from 'pg-boss';
import type { AgentRunsDb } from '@deucex/actions';
import { enqueueAgentRun } from '@deucex/actions/queue';
import type { AgentHandler } from '../agent-dispatcher';
import type { FinancialActionModelClient } from '@deucex/agents';
import { FINANCIAL_AGENT_NAME } from './scheduler';
import { runFinancialAgent, type FinancialRunLogger } from './run';

const REQUIRED_PROVIDERS = ['openai'] as const;

export interface FinancialAgentDeps {
  db: SupabaseClient<Database>;
  client: FinancialActionModelClient;
  agentRuns: AgentRunsDb;
  logger?: FinancialRunLogger;
}

// Returns the Financial Agent's handler (the morning run schedules it) for
// the shared AGENT_RUN_QUEUE dispatcher for the shared AGENT_RUN_QUEUE dispatcher
// (../agent-dispatcher.ts, step 5.1), same shape as mindset-coach/worker.ts.
export async function registerFinancialAgent(
  boss: PgBoss,
  deps: FinancialAgentDeps,
): Promise<AgentHandler> {
  const logger = deps.logger ?? console;
  // Scheduled by the 07:00-local morning run (morning-run/scheduler.ts).

  return {
    agentName: FINANCIAL_AGENT_NAME,
    label: 'The Financial Agent',
    requiredProviders: REQUIRED_PROVIDERS,
    run: async (job) => {
      await runFinancialAgent(
        { db: deps.db, client: deps.client, agentRuns: deps.agentRuns, logger },
        job.playerId,
        job.triggerType,
      );
    },
  };
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
