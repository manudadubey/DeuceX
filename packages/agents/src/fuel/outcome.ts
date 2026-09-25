// PRD-07 section 7's outcome inference (FU-15, FU-AC-9; built as specified,
// owner decision step 4.3): if the player hasn't tapped by 18:00 local the
// day after the meal, and a note or check-in that day carries a mood, infer
// Worked for Confident or Energised and Flat next day for Flat or
// Frustrated. Deterministic, no model.

export const OUTCOME_INFERENCE_HOUR = 18;

export type NoteMood = 'frustrated' | 'flat' | 'confident' | 'energised';

export interface NextDayMoodSignals {
  /** Moods on match notes saved on the day after the meal, newest first. */
  noteMoods: NoteMood[];
  /** That day's 1-5 check-in value, if any. */
  checkInValue: number | null;
}

// A note's mood is the PRD's own signal, so it wins over the check-in. The
// check-in is a 1-5 scale, not a mood word: 4-5 reads as Worked, 1-2 as
// Flat, and a 3 infers nothing.
export function inferOutcome(signals: NextDayMoodSignals): 'worked' | 'flat' | null {
  const mood = signals.noteMoods[0];
  if (mood === 'confident' || mood === 'energised') return 'worked';
  if (mood === 'flat' || mood === 'frustrated') return 'flat';
  if (signals.checkInValue !== null) {
    if (signals.checkInValue >= 4) return 'worked';
    if (signals.checkInValue <= 2) return 'flat';
  }
  return null;
}

// True once it is 18:00 or later, local, on the day after the meal (or any
// later day). Dates are the player's local YYYY-MM-DD.
export function inferenceDue(mealLocalDate: string, nowLocalDate: string, nowLocalHour: number) {
  const nextDate = dayAfter(mealLocalDate);
  if (nowLocalDate > nextDate) return true;
  return nowLocalDate === nextDate && nowLocalHour >= OUTCOME_INFERENCE_HOUR;
}

export function dayAfter(localDate: string): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
