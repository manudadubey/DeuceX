import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { PgBoss } from 'pg-boss';
import { enqueueAgentRun } from '@deucex/actions/queue';
import { TOURNAMENT_AGENT_NAME } from './run';

export const TOURNAMENT_SCHEDULER_QUEUE = 'tournament-scheduler';

// PRD-01 section 3: "Scheduled every Sunday 20:00 UTC" — a fixed UTC
// weekday-and-hour, the same shape as financial/scheduler.ts's own fixed
// 07:00 UTC (not per-player local time, unlike mindset-coach's scheduler).
export const SCHEDULED_WEEKDAY_UTC = 0; // Sunday
export const SCHEDULED_HOUR_UTC = 20;

export function isScheduledMoment(
  now: Date,
  weekday: number = SCHEDULED_WEEKDAY_UTC,
  hour: number = SCHEDULED_HOUR_UTC,
): boolean {
  return now.getUTCDay() === weekday && now.getUTCHours() === hour;
}

// A weekly window, not a daily date: (agent_name, player_id, scheduled_window)
// is the idempotency key every scheduled agent already relies on (step 0.6),
// and this run only fires once a week, so the key is the ISO date of the
// Monday that starts this run's own week rather than the run day itself —
// stable even if a retry crosses midnight.
export function scheduledWindowFor(now: Date): string {
  const date = new Date(now);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export interface TournamentSchedulablePlayer {
  id: string;
}

export async function listSchedulablePlayers(
  db: SupabaseClient<Database>,
): Promise<TournamentSchedulablePlayer[]> {
  const { data, error } = await db.from('players').select('id');
  if (error) throw error;
  return data ?? [];
}

export interface TournamentSchedulerLogger {
  error(...args: unknown[]): void;
}

export async function registerTournamentScheduler(
  boss: PgBoss,
  deps: { db: SupabaseClient<Database>; logger?: TournamentSchedulerLogger; now?: () => Date },
): Promise<void> {
  const logger = deps.logger ?? console;
  await boss.createQueue(TOURNAMENT_SCHEDULER_QUEUE);
  await boss.schedule(TOURNAMENT_SCHEDULER_QUEUE, '0 * * * *', {});

  await boss.work(TOURNAMENT_SCHEDULER_QUEUE, async () => {
    try {
      const now = (deps.now ?? (() => new Date()))();
      if (!isScheduledMoment(now)) return;

      const players = await listSchedulablePlayers(deps.db);
      for (const player of players) {
        await enqueueAgentRun(boss, {
          agentName: TOURNAMENT_AGENT_NAME,
          playerId: player.id,
          scheduledWindow: scheduledWindowFor(now),
          triggerType: 'schedule',
        });
      }
    } catch (err) {
      logger.error('[tournament-scheduler] tick failed:', err);
      throw err;
    }
  });
}
