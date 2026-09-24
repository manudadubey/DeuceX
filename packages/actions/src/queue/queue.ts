import { PgBoss, type Job } from 'pg-boss';
import { buildAgentJobSingletonKey } from './idempotency-key';
import { evaluatePickup, type ProviderState } from './pickup-guard';
import { nextRetryDelaySeconds } from './retry-schedule';

export const AGENT_RUN_QUEUE = 'agent-run';

// A window this generous (24h) means a scheduled run and any manual
// re-trigger for the same agent/player/window collapse into one job even if
// they're sent minutes apart, which is the point of the idempotency key
// (TECH-ARCHITECTURE.md section 3): "a retried or duplicated enqueue is a
// no-op rather than a second run."
const SINGLETON_WINDOW_SECONDS = 24 * 60 * 60;

export interface AgentJobData {
  agentName: string;
  playerId: string;
  scheduledWindow: string;
  triggerType: 'schedule' | 'manual' | 'event' | 'threshold';
  /** 0 for the first attempt; incremented by the worker on each scheduled retry. */
  retryCount: number;
}

export async function createBoss(connectionString: string): Promise<PgBoss> {
  // Pool capped (step 4.1): see apps/api/src/money/queue.ts's note on the session pooler's 15-client limit.
  const boss = new PgBoss({ connectionString, max: 3 });
  await boss.start();
  // retryLimit: 0 — pg-boss's own retry counter is unused; retries are
  // scheduled manually below via sendAfter, on the 5/20/60 minute schedule
  // the build plan specifies (see retry-schedule.ts for why pg-boss's own
  // retryBackoff, exponential only, can't express that exact sequence).
  await boss.createQueue(AGENT_RUN_QUEUE, { retryLimit: 0 });
  return boss;
}

export interface EnqueueAgentRunInput {
  agentName: string;
  playerId: string;
  scheduledWindow: string;
  triggerType: AgentJobData['triggerType'];
}

export async function enqueueAgentRun(
  boss: PgBoss,
  input: EnqueueAgentRunInput,
): Promise<string | null> {
  const data: AgentJobData = { ...input, retryCount: 0 };
  return boss.send(AGENT_RUN_QUEUE, data, {
    singletonKey: buildAgentJobSingletonKey(input),
    singletonSeconds: SINGLETON_WINDOW_SECONDS,
  });
}

export interface AgentWorkerDeps {
  /** Looks up whether this (player, agent) pair is paused (agent_schedules.paused). */
  getAgentPaused(agentName: string, playerId: string): Promise<boolean>;
  /** Looks up the current state of every named provider (provider_switches, latest row per provider). */
  getProviderStates(providers: readonly string[]): Promise<Record<string, ProviderState>>;
  /** The providers this agent depends on. */
  requiredProviders: readonly string[];
  /** Runs the agent itself. Any throw here triggers a scheduled retry (or, past the third, onRetriesExhausted). */
  runAgent(job: AgentJobData): Promise<void>;
  /** The pickup guard skipped this job; write whatever record that needs (e.g. an agent_runs row with a skipped status). */
  onSkippedPaused?(job: AgentJobData, cause: 'agent_paused' | { provider: string }): Promise<void>;
  /** All three retries failed; the run is done, not just delayed. */
  onRetriesExhausted?(job: AgentJobData, error: unknown): Promise<void>;
}

// Wires the pickup-time pause/provider-switch check and the manual 5/20/60
// minute retry schedule onto a real pg-boss queue. Exercised end to end only
// by queue.integration.test.ts, which needs a live Postgres connection and
// is skipped here and in CI for the same reason
// packages/db/src/rls.integration.test.ts already is. The decision logic it
// calls — evaluatePickup, nextRetryDelaySeconds — is what pickup-guard.test.ts
// and retry-schedule.test.ts cover without one.
export async function registerAgentWorker(boss: PgBoss, deps: AgentWorkerDeps): Promise<string> {
  return boss.work<AgentJobData>(AGENT_RUN_QUEUE, async (jobs: Job<AgentJobData>[]) => {
    for (const job of jobs) {
      await handleJob(boss, job, deps);
    }
  });
}

async function handleJob(
  boss: PgBoss,
  job: Job<AgentJobData>,
  deps: AgentWorkerDeps,
): Promise<void> {
  const [agentPaused, providerStates] = await Promise.all([
    deps.getAgentPaused(job.data.agentName, job.data.playerId),
    deps.getProviderStates(deps.requiredProviders),
  ]);

  const decision = evaluatePickup({
    agentPaused,
    providerStates,
    requiredProviders: deps.requiredProviders,
  });

  if (!decision.proceed) {
    await deps.onSkippedPaused?.(job.data, decision.cause);
    return;
  }

  try {
    await deps.runAgent(job.data);
  } catch (error) {
    const nextRetryCount = job.data.retryCount + 1;
    const delaySeconds = nextRetryDelaySeconds(nextRetryCount);

    if (delaySeconds === null) {
      await deps.onRetriesExhausted?.(job.data, error);
      return;
    }

    const retryData: AgentJobData = { ...job.data, retryCount: nextRetryCount };
    await boss.sendAfter(AGENT_RUN_QUEUE, retryData, null, delaySeconds);
  }
}
