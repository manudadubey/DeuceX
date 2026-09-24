import type { OpenMark, PatronFlag, PatronNoteKind, PatronRecord } from './types';

// PRD-04 section 7's attention flags and P-9's Needs attention filter. The
// thresholds (three unopened updates, 30 days, 90 days, 7 days new) are the
// register's placeholders, deliberately kept as named constants so a later
// tuning pass changes one line (decisions worksheet part two: "safe to
// launch with current defaults").

const DAY_MS = 24 * 60 * 60 * 1000;

export const QUIET_UNOPENED_UPDATES = 3;
export const QUIET_MIN_AGE_DAYS = 30;
export const NEW_PATRON_DAYS = 7;
export const DEPARTED_ATTENTION_DAYS = 90;

/** The last N delivered updates (null marks skipped), most recent last. */
function lastDelivered(opens: readonly OpenMark[], n: number): (1 | 0)[] {
  return opens.filter((o): o is 1 | 0 => o !== null).slice(-n);
}

/**
 * One flag at most, in the order card, quiet, new (PRD-04 section 7). A
 * departed patron carries no flag: their row shows the "Left <date>" badge
 * instead, and P-8 allows only one state badge per patron.
 */
export function computePatronFlag(
  patron: Pick<PatronRecord, 'status' | 'since' | 'opens' | 'cardFailedAt'>,
  now: Date,
): PatronFlag {
  if (patron.status === 'left') return 'none';
  if (patron.status === 'past_due' || patron.cardFailedAt !== null) return 'card';
  const ageDays = (now.getTime() - new Date(patron.since).getTime()) / DAY_MS;
  const delivered = lastDelivered(patron.opens, QUIET_UNOPENED_UPDATES);
  if (
    ageDays > QUIET_MIN_AGE_DAYS &&
    delivered.length === QUIET_UNOPENED_UPDATES &&
    delivered.every((o) => o === 0)
  ) {
    return 'quiet';
  }
  if (ageDays <= NEW_PATRON_DAYS) return 'new';
  return 'none';
}

/** P-9: flagged card or quiet, or left within the last 90 days. A new patron is not "attention". */
export function needsAttention(
  patron: Pick<PatronRecord, 'status' | 'leftAt'>,
  flag: PatronFlag,
  now: Date,
): boolean {
  if (patron.status === 'left') {
    return (
      patron.leftAt !== null &&
      now.getTime() - new Date(patron.leftAt).getTime() <= DEPARTED_ATTENTION_DAYS * DAY_MS
    );
  }
  return flag === 'card' || flag === 'quiet';
}

/** P-10: a thank-you for a departure, a gentle nudge for a failed card, a check-in for a quiet patron, a welcome for a new one. */
export function noteKindFor(
  patron: Pick<PatronRecord, 'status'>,
  flag: PatronFlag,
): PatronNoteKind {
  if (patron.status === 'left') return 'thanks';
  if (flag === 'card') return 'nudge';
  if (flag === 'new') return 'welcome';
  return 'checkin';
}

/** The row's single action label (prototype renderPatrons). */
export function noteActionLabel(kind: PatronNoteKind): string {
  if (kind === 'thanks') return 'Send a thank-you';
  if (kind === 'nudge') return 'Nudge gently';
  return 'Send a note';
}

/** "5 of 6 opened": opened count over delivered count. */
export function openSummary(opens: readonly OpenMark[]): { opened: number; delivered: number } {
  const delivered = opens.filter((o) => o !== null);
  return { opened: delivered.filter((o) => o === 1).length, delivered: delivered.length };
}
