// PRD-05 C-8, C-9, C-12 and section 7: who receives an update and when.
// Owner decision (step 4.2): Locker Room and above get the practice-notes
// section; Inside Track is proposed like any other tier (no day-early send
// and no call notes yet, both named follow-ups).

export interface RecipientTier {
  id: string;
  /** 1 Courtside, 2 Locker Room, 3 Inside Track (PRD-04). */
  position: number;
  name: string;
  /** Active patrons (active or payment-retrying, not paused or left) on this tier. */
  activeCount: number;
}

export interface TierProposal {
  tierId: string;
  selected: boolean;
  /** "Every update · 8 people" */
  reason: string;
}

/** Tiers at or above this position receive the practice-notes section (C-9). */
export const PRACTICE_SECTION_MIN_POSITION = 2;

export function tierGetsPracticeSection(position: number): boolean {
  return position >= PRACTICE_SECTION_MIN_POSITION;
}

function people(n: number): string {
  return `${n} ${n === 1 ? 'person' : 'people'}`;
}

/** C-8: one line per tier with a reason; tiers with nobody on them start unselected. */
export function proposeRecipients(
  tiers: readonly RecipientTier[],
  hasPracticeSection: boolean,
): TierProposal[] {
  return [...tiers]
    .sort((a, b) => a.position - b.position)
    .map((t) => {
      if (t.activeCount === 0) {
        return { tierId: t.id, selected: false, reason: 'No patrons on this tier yet' };
      }
      const what =
        tierGetsPracticeSection(t.position) && hasPracticeSection
          ? 'Adds the practice notes section'
          : 'Every update';
      return { tierId: t.id, selected: true, reason: `${what} · ${people(t.activeCount)}` };
    });
}

export function recipientCount(
  tiers: readonly RecipientTier[],
  selectedIds: readonly string[],
): number {
  return tiers.filter((t) => selectedIds.includes(t.id)).reduce((n, t) => n + t.activeCount, 0);
}

/** "11 patrons · Courtside + Locker Room", or "No one selected" (C-AC-4). */
export function recipientLine(
  tiers: readonly RecipientTier[],
  selectedIds: readonly string[],
): string {
  const chosen = [...tiers]
    .filter((t) => selectedIds.includes(t.id))
    .sort((a, b) => a.position - b.position);
  if (chosen.length === 0) return 'No one selected';
  const n = recipientCount(tiers, selectedIds);
  return `${n} ${n === 1 ? 'patron' : 'patrons'} · ${chosen.map((t) => t.name).join(' + ')}`;
}

// ---------------------------------------------------------------------------
// Send time (C-12)
// ---------------------------------------------------------------------------

export type SendTimeKind = 'now' | 'tomorrow' | 'deadline';

export interface SendTimeOption {
  kind: SendTimeKind;
  label: string;
  /** Null for Send now. */
  sendAt: string | null;
}

/** The UTC instant of a given local wall-clock time in an IANA time zone. */
export function zonedTimeToUtc(
  date: { year: number; month: number; day: number },
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const offset = (instant: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return (
      Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - instant
    );
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

export function localDate(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function addDays(d: { year: number; month: number; day: number }, n: number) {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

export interface UpcomingDeadline {
  tournamentName: string;
  /** ISO instant the entry closes. */
  deadlineAt: string;
}

/**
 * Send now, Tomorrow 07:00 local, and the next tournament deadline day at
 * 07:00 local when that falls inside seven days and is still before the
 * deadline itself.
 */
export function sendTimeOptions(
  now: Date,
  timeZone: string,
  deadline: UpcomingDeadline | null,
): SendTimeOption[] {
  const options: SendTimeOption[] = [{ kind: 'now', label: 'Send now', sendAt: null }];
  const tomorrow = zonedTimeToUtc(addDays(localDate(now, timeZone), 1), 7, 0, timeZone);
  options.push({
    kind: 'tomorrow',
    label: 'Tomorrow · 07:00 your time',
    sendAt: tomorrow.toISOString(),
  });

  if (deadline) {
    const deadlineAt = new Date(deadline.deadlineAt);
    const sendAt = zonedTimeToUtc(localDate(deadlineAt, timeZone), 7, 0, timeZone);
    const withinWeek = deadlineAt.getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000;
    if (
      withinWeek &&
      sendAt.getTime() > now.getTime() &&
      sendAt.getTime() < deadlineAt.getTime() &&
      sendAt.getTime() !== tomorrow.getTime()
    ) {
      const weekday = new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone }).format(
        sendAt,
      );
      options.push({
        kind: 'deadline',
        label: `${weekday} · before the ${deadline.tournamentName} deadline`,
        sendAt: sendAt.toISOString(),
      });
    }
  }
  return options;
}

/** C-1 / section 7: when a queued draft runs after a saved note. Null for "Only when I ask". */
export function draftDueAt(
  window: 'thirty_minutes' | 'next_morning' | 'manual',
  savedAt: Date,
  timeZone: string,
): Date | null {
  if (window === 'manual') return null;
  if (window === 'thirty_minutes') return new Date(savedAt.getTime() + 30 * 60 * 1000);
  const today = localDate(savedAt, timeZone);
  const sameDay = zonedTimeToUtc(today, 6, 30, timeZone);
  return sameDay.getTime() > savedAt.getTime()
    ? sameDay
    : zonedTimeToUtc(addDays(today, 1), 6, 30, timeZone);
}
