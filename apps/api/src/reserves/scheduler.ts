import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { PgBoss } from 'pg-boss';
import { RESERVE_REMINDER_QUEUE } from '../money/queue';

// PRD-03 F-4: "A Sunday 20:00 local FYI reminder to update the balance,
// default on." No per-player toggle exists yet (that's the `#balRemind`
// switch on the Financial Agent page, step 2.2) and quiet hours aren't
// wired up either (Settings > Notifications, step 2.3) — same kind of
// deliberate skip mindset-coach's scheduler documented for its own
// delivery-hour setting. Every player currently gets this one default.
export const DEFAULT_REMINDER_DAY_OF_WEEK = 0; // Sunday
export const DEFAULT_REMINDER_HOUR = 20; // 20:00 local

export interface ReminderEligiblePlayer {
  id: string;
  timezone: string;
}

function localWeekdayAndHour(now: Date, timezone: string): { dayOfWeek: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  return {
    dayOfWeek: WEEKDAYS.indexOf(weekday),
    hour: Number(hourStr) % 24, // some locales render midnight as "24"
  };
}

// Pure so it's testable without a clock or a database, mirroring
// mindset-coach/scheduler.ts's playersDueThisHour, just with a day-of-week
// check added on top.
export function playersDueThisWeekAtHour(
  players: readonly ReminderEligiblePlayer[],
  now: Date,
  target: { dayOfWeek: number; hour: number } = {
    dayOfWeek: DEFAULT_REMINDER_DAY_OF_WEEK,
    hour: DEFAULT_REMINDER_HOUR,
  },
): ReminderEligiblePlayer[] {
  return players.filter((p) => {
    const local = localWeekdayAndHour(now, p.timezone);
    return local.dayOfWeek === target.dayOfWeek && local.hour === target.hour;
  });
}

async function isFinancialAgentPaused(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('agent_schedules')
    .select('paused')
    .eq('agent_name', 'financial')
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw error;
  return data?.paused ?? false;
}

// "Simplest correct thing at today's player volume" (mindset-coach/scheduler.ts's
// own comment on the same tradeoff): one paused-check query per player
// rather than a join, not a query pattern to keep once real volume exists.
export async function listReminderEligiblePlayers(
  db: SupabaseClient<Database>,
): Promise<ReminderEligiblePlayer[]> {
  const { data, error } = await db.from('players').select('id, timezone');
  if (error) throw error;

  const eligible: ReminderEligiblePlayer[] = [];
  for (const player of data ?? []) {
    if (!(await isFinancialAgentPaused(db, player.id))) {
      eligible.push({ id: player.id, timezone: player.timezone });
    }
  }
  return eligible;
}

export async function sendReserveReminderNotification(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<void> {
  const { error } = await db.from('notifications').insert({
    player_id: playerId,
    agent: 'financial',
    category: 'fyi',
    title: 'Update your cash balance',
    body: 'A quick weekly update keeps your runway accurate. Takes a minute.',
    action_href: '/agent/financial',
  });
  if (error) throw error;
}

export interface ReserveReminderSchedulerDeps {
  db: SupabaseClient<Database>;
  logger?: { error(...args: unknown[]): void };
  now?: () => Date;
}

export async function registerReserveReminderScheduler(
  boss: PgBoss,
  deps: ReserveReminderSchedulerDeps,
): Promise<void> {
  const logger = deps.logger ?? console;

  await boss.work(RESERVE_REMINDER_QUEUE, async () => {
    try {
      const now = (deps.now ?? (() => new Date()))();
      const players = await listReminderEligiblePlayers(deps.db);
      const due = playersDueThisWeekAtHour(players, now);
      for (const player of due) {
        await sendReserveReminderNotification(deps.db, player.id);
      }
    } catch (err) {
      logger.error('[reserve-reminder-scheduler] tick failed:', err);
      throw err;
    }
  });
}
