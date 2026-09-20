// Integration tests against a real Postgres connection (pg-boss needs one to
// do anything: it manages its own job tables and can't be faked the way
// gate.test.ts and record-run.test.ts fake a Supabase client). Skipped, not
// failed, without SUPABASE_DB_URL — the same env var and the same reasoning
// as packages/db/src/rls.integration.test.ts: CI and most dev machines don't
// have the project's database password. The pure decision logic these tests
// would exercise around pg-boss (the idempotency key, the pickup guard, the
// retry schedule) is covered without a database by idempotency-key.test.ts,
// pickup-guard.test.ts and retry-schedule.test.ts.
import { randomUUID } from 'node:crypto';
import type { PgBoss } from 'pg-boss';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AGENT_RUN_QUEUE, createBoss, enqueueAgentRun, registerAgentWorker } from './queue';

const DATABASE_URL = process.env.SUPABASE_DB_URL;
const describeIfConfigured = DATABASE_URL ? describe : describe.skip;

describeIfConfigured('pg-boss queue (real Postgres)', () => {
  let boss: PgBoss;

  beforeAll(async () => {
    boss = await createBoss(DATABASE_URL!);
  });

  afterAll(async () => {
    await boss.stop({ graceful: false });
  });

  afterEach(async () => {
    await boss.deleteAllJobs(AGENT_RUN_QUEUE);
  });

  it('a duplicate enqueue for the same agent/player/window is a no-op', async () => {
    const input = {
      agentName: 'tournament-agent',
      playerId: randomUUID(),
      scheduledWindow: '2026-09-21',
      triggerType: 'schedule' as const,
    };

    const first = await enqueueAgentRun(boss, input);
    const second = await enqueueAgentRun(boss, input);

    expect(first).not.toBeNull();
    expect(second).toBeNull();

    const jobs = await boss.fetch(AGENT_RUN_QUEUE, { batchSize: 10 });
    expect(jobs).toHaveLength(1);
  });

  it('a paused agent is skipped_paused and the agent itself never runs', async () => {
    const playerId = randomUUID();
    await enqueueAgentRun(boss, {
      agentName: 'mindset-coach',
      playerId,
      scheduledWindow: '2026-09-21',
      triggerType: 'schedule',
    });

    let ran = false;
    let skipped: unknown = null;

    const workerName = await registerAgentWorker(boss, {
      getAgentPaused: async () => true,
      getProviderStates: async () => ({}),
      requiredProviders: [],
      runAgent: async () => {
        ran = true;
      },
      onSkippedPaused: async (_job, cause) => {
        skipped = cause;
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    await boss.offWork(AGENT_RUN_QUEUE);
    void workerName;

    expect(ran).toBe(false);
    expect(skipped).toBe('agent_paused');
  });
});
