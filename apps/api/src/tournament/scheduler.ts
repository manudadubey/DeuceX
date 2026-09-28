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

/**
 * The most recent Sunday 20:00 UTC at or before `now`. Catch-up (28 September
 * 2026): the tick used to act only inside that one hour, so if apps/api was
 * down then every player missed the week's shortlist. Any later tick in the
 * week now runs it for players who haven't had a run since this instant.
 */
export function lastScheduledInstant(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SCHEDULED_HOUR_UTC),
  );
  const back = (d.getUTCDay() - SCHEDULED_WEEKDAY_UTC + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  if (d.getTime() > now.getTime()) d.setUTCDate(d.getUTCDate() - 7);
  return d;
}

/** Pure: which players still need this week's run. */
export function playersNeedingRun(
  players: readonly TournamentSchedulablePlayer[],
  ranSince: ReadonlySet<string>,
): TournamentSchedulablePlayer[] {
  return players.filter((p) => !ranSince.has(p.id));
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
      const since = lastScheduledInstant(now);

      const players = await listSchedulablePlayers(deps.db);
      const { data: runs, error } = await deps.db
        .from('agent_runs')
        .select('player_id')
        .eq('agent_name', TOURNAMENT_AGENT_NAME)
        .gte('started_at', since.toISOString());
      if (error) throw error;
      const ranSince = new Set((runs ?? []).map((r) => r.player_id).filter(Boolean) as string[]);

      for (const player of playersNeedingRun(players, ranSince)) {
        await enqueueAgentRun(boss, {
          agentName: TOURNAMENT_AGENT_NAME,
          playerId: player.id,
          // Keyed on the scheduled instant's week, so a catch-up tick and the
          // on-time one share the idempotency key.
          scheduledWindow: scheduledWindowFor(since),
          triggerType: 'schedule',
        });
      }
    } catch (err) {
      logger.error('[tournament-scheduler] tick failed:', err);
      throw err;
    }
  });

  // Catch up now rather than at the top of the next hour.
  await boss.send(TOURNAMENT_SCHEDULER_QUEUE, {});
}
