import {
  isNotificationChannelEnabled,
  prefsAgentFor,
  type NotificationCategory,
  type NotificationPrefs,
} from '@deucex/db';

// Step 5.2: how one notification is delivered beyond the in-app rail. Pure,
// so every rule is testable without a clock, a database or a vendor:
// - per agent, category and channel (PRD-12 ST-9): the player's matrix,
//   where a missing key means on;
// - quiet hours (M-NOTIF-2, ST-10): default 22:00 to 07:00 local; a
//   delivery inside them is held until they end, except an entry-deadline
//   notification inside 24 hours of its deadline (ST-AC-7);
// - the weekly digest (M-NOTIF-3): once a player has had five FYI emails in
//   the last seven days, further FYI emails go into one weekly digest
//   instead of arriving one by one.

export type DeliveryChannel = 'email' | 'push';

export const DIGEST_FYI_EMAILS_PER_WEEK = 5;
export const DEADLINE_BREAKTHROUGH_MS = 24 * 60 * 60 * 1000;

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** The player's local time of day, in minutes since midnight. */
export function localMinutes(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export interface QuietHours {
  start: string; // "22:00" or "22:00:00"
  end: string;
}

export function inQuietHours(now: Date, timezone: string, quiet: QuietHours): boolean {
  const start = minutesOfDay(quiet.start);
  const end = minutesOfDay(quiet.end);
  if (start === end) return false;
  const t = localMinutes(now, timezone);
  // A window that wraps midnight (22:00 to 07:00) or one that doesn't (13:00 to 15:00).
  return start > end ? t >= start || t < end : t >= start && t < end;
}

/** When quiet hours next end, from inside them. */
export function quietHoursEnd(now: Date, timezone: string, quiet: QuietHours): Date {
  const minutesLeft = (minutesOfDay(quiet.end) - localMinutes(now, timezone) + 1440) % 1440;
  const due = new Date(now.getTime() + minutesLeft * 60_000);
  due.setUTCSeconds(0, 0);
  return due;
}

/** M-NOTIF-2: only an entry deadline inside its last 24 hours breaks quiet hours. */
export function deadlineBreaksThrough(deadlineAt: string | null, now: Date): boolean {
  if (!deadlineAt) return false;
  const left = new Date(deadlineAt).getTime() - now.getTime();
  return left > 0 && left <= DEADLINE_BREAKTHROUGH_MS;
}

export interface PlanNotification {
  agent: string;
  category: NotificationCategory;
  deadlineAt: string | null;
}

export interface PlanPlayer {
  email: string | null;
  timezone: string;
  quietHours: QuietHours;
  prefs: NotificationPrefs;
  hasPushSubscription: boolean;
  /** FYI emails sent or queued to this player in the last seven days. */
  fyiEmailsLastWeek: number;
}

export interface PlannedDelivery {
  channel: DeliveryChannel;
  status: 'pending' | 'digest';
  dueAt: Date;
  heldForQuietHours: boolean;
}

/** Which channels a notification goes out on, and when. In-app is the rail itself, not a delivery. */
export function planDeliveries(
  notification: PlanNotification,
  player: PlanPlayer,
  now: Date,
): PlannedDelivery[] {
  const agent = prefsAgentFor(notification.agent);
  const enabled = (channel: DeliveryChannel) =>
    agent
      ? isNotificationChannelEnabled(player.prefs, agent, notification.category, channel)
      : true;

  const quiet =
    inQuietHours(now, player.timezone, player.quietHours) &&
    !deadlineBreaksThrough(notification.deadlineAt, now);
  const dueAt = quiet ? quietHoursEnd(now, player.timezone, player.quietHours) : now;

  const planned: PlannedDelivery[] = [];
  if (player.email && enabled('email')) {
    const digest =
      notification.category === 'fyi' && player.fyiEmailsLastWeek >= DIGEST_FYI_EMAILS_PER_WEEK;
    planned.push({
      channel: 'email',
      status: digest ? 'digest' : 'pending',
      dueAt,
      heldForQuietHours: quiet && !digest,
    });
  }
  if (player.hasPushSubscription && enabled('push')) {
    planned.push({ channel: 'push', status: 'pending', dueAt, heldForQuietHours: quiet });
  }
  return planned;
}

/** The Monday a local date's week starts on, as YYYY-MM-DD. */
export function weekStart(now: Date, timezone: string): string {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  const d = new Date(`${local}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}
