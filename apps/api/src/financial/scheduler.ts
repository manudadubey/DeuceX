import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { PgBoss } from 'pg-boss';
import { enqueueAgentRun } from '@deucex/actions/queue';

export const FINANCIAL_SCHEDULER_QUEUE = 'financial-scheduler';
export const FINANCIAL_AGENT_NAME = 'financial';

// PRD-03 section 3: "Scheduled daily at 07:00 UTC" — a fixed UTC hour, not
// per-player local time like Mindset Coach's own scheduler.ts, so this one
// has no timezone lookup at all.
export const SCHEDULED_HOUR_UTC = 7;

export interface FinancialSchedulablePlayer {
  id: string;
}

export async function listSchedulablePlayers(
  db: SupabaseClient<Database>,
): Promise<FinancialSchedulablePlayer[]> {
  const { data, error } = await db.from('players').select('id');
  if (error) throw error;
  return data ?? [];
}

export function isScheduledHour(now: Date, hour: number = SCHEDULED_HOUR_UTC): boolean {
  return now.getUTCHours() === hour;
}

export function utcDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface FinancialSchedulerLogger {
  error(...args: unknown[]): void;
}

// Wires the hourly tick onto packages/actions' AGENT_RUN_QUEUE, the same
// pattern as mindset-coach/scheduler.ts, filtered down to the one hour a
// day PRD-03 actually asks for; a second tick inside 07:00 UTC (or a manual
// re-trigger) is a no-op via the idempotency key on
// (agent_name, player_id, scheduledWindow), same as every other scheduled
// agent.
export async function registerFinancialScheduler(
  boss: PgBoss,
  deps: { db: SupabaseClient<Database>; logger?: FinancialSchedulerLogger; now?: () => Date },
): Promise<void> {
  const logger = deps.logger ?? console;
  await boss.createQueue(FINANCIAL_SCHEDULER_QUEUE);
  await boss.schedule(FINANCIAL_SCHEDULER_QUEUE, '0 * * * *', {});

  await boss.work(FINANCIAL_SCHEDULER_QUEUE, async () => {
    try {
      const now = (deps.now ?? (() => new Date()))();
      if (!isScheduledHour(now)) return;

      const players = await listSchedulablePlayers(deps.db);
      for (const player of players) {
        await enqueueAgentRun(boss, {
          agentName: FINANCIAL_AGENT_NAME,
          playerId: player.id,
          scheduledWindow: utcDateString(now),
          triggerType: 'schedule',
        });
      }
    } catch (err) {
      logger.error('[financial-scheduler] tick failed:', err);
      throw err;
    }
  });
}
