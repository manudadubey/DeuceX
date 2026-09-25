import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { PgBoss } from 'pg-boss';
import { RESERVE_REMINDER_QUEUE } from '../money/queue';

// PRD-03 F-4: "A Sunday 20:00 local FYI reminder to update the balance,
// default on." The per-player toggle (players.reserve_reminder_enabled) and
// quiet hours (players.quiet_hours_start/end) both land here in step 2.3,
// closing the follow-up both step 2.1 and step 2.2's BUILD-LOG entries
// flagged by name.
export const DEFAULT_REMINDER_DAY_OF_WEEK = 0; // Sunday
export const DEFAULT_REMINDER_HOUR = 20; // 20:00 local

export interface ReminderEligiblePlayer {
  id: string;
  timezone: string;
  quietHoursStartHour: number;
  quietHoursEndHour: number;
}

function parseHour(time: string): number {
  return Number(time.split(':')[0] ?? '0');
}

// PRD-12 section 7: "a notification queued between quiet hours is held
// until [quiet hours end]." The reserve reminder is always FYI, so unlike
// an entry-deadline notification it never bypasses quiet hours — it is
// held, not dropped. A zero-length window (start === end) is treated as
// quiet hours effectively off, since there is no way to distinguish that
// from "always quiet" otherwise.
export function isWithinQuietHours(
  hour: number,
  quietStartHour: number,
  quietEndHour: number,
): boolean {
  if (quietStartHour === quietEndHour) return false;
  if (quietStartHour < quietEndHour) return hour >= quietStartHour && hour < quietEndHour;
  return hour >= quietStartHour || hour < quietEndHour; // wraps past midnight, e.g. 22 -> 7
}

// The day/hour this player actually gets the reminder, after quiet hours:
// unchanged from the Sunday 20:00 default unless that moment falls inside
// this player's own quiet hours, in which case delivery moves to the
// moment quiet hours end — the next calendar day if the quiet window wraps
// past midnight and the base hour was on the "before midnight" side of it.
export function effectiveReminderTarget(
  quietHoursStartHour: number,
  quietHoursEndHour: number,
  baseDayOfWeek: number = DEFAULT_REMINDER_DAY_OF_WEEK,
  baseHour: number = DEFAULT_REMINDER_HOUR,
): { dayOfWeek: number; hour: number } {
  if (!isWithinQuietHours(baseHour, quietHoursStartHour, quietHoursEndHour)) {
    return { dayOfWeek: baseDayOfWeek, hour: baseHour };
  }
  const wrapsPastMidnight = quietHoursStartHour > quietHoursEndHour;
  const heldPastMidnight = wrapsPastMidnight && baseHour >= quietHoursStartHour;
  return {
    dayOfWeek: heldPastMidnight ? (baseDayOfWeek + 1) % 7 : baseDayOfWeek,
    hour: quietHoursEndHour,
  };
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
// check (and, since step 2.3, each player's own quiet-hours-adjusted
// target) added on top.
export function playersDueThisWeekAtHour(
  players: readonly ReminderEligiblePlayer[],
  now: Date,
): ReminderEligiblePlayer[] {
  return players.filter((p) => {
    const local = localWeekdayAndHour(now, p.timezone);
    const target = effectiveReminderTarget(p.quietHoursStartHour, p.quietHoursEndHour);
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
  const { data, error } = await db
    .from('players')
    .select('id, timezone, quiet_hours_start, quiet_hours_end, reserve_reminder_enabled');
  if (error) throw error;

  const eligible: ReminderEligiblePlayer[] = [];
  for (const player of data ?? []) {
    if (player.reserve_reminder_enabled === false) continue;
    if (await isFinancialAgentPaused(db, player.id)) continue;
    eligible.push({
      id: player.id,
      timezone: player.timezone,
      quietHoursStartHour: parseHour(player.quiet_hours_start),
      quietHoursEndHour: parseHour(player.quiet_hours_end),
    });
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
