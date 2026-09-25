import type { FuelMode } from './types';

// PRD-07 section 7's thresholds. Section 12 lists all three as placeholders
// pending real players, so they are named here rather than inlined.
export const PRE_MATCH_WINDOW_HOURS = 16;
export const POST_MATCH_WINDOW_HOURS = 6;
export const TRAVEL_WINDOW_HOURS = 6;
export const REST_THRESHOLD_HOURS = 36;
export const LATE_TRAVEL_HOUR = 22;

export interface ModeInput {
  now: Date;
  /** Player's local hour at `now`, 0 to 23. */
  localHour: number;
  nextMatchAt: Date | null;
  lastMatchEndedAt: Date | null;
  travelLegEndedAt: Date | null;
  travelToday: boolean;
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

// PRD-07 section 7, in the order it lists the rules. An unknown next match
// never reads as Rest: Rest lifts the Heavy and Fried restrictions, so it
// needs a positive reason (a match known to be more than 36 hours away).
export function deriveMode(input: ModeInput): FuelMode {
  const hoursToNext =
    input.nextMatchAt && input.nextMatchAt > input.now
      ? hoursBetween(input.now, input.nextMatchAt)
      : null;
  const hoursSinceLast =
    input.lastMatchEndedAt && input.lastMatchEndedAt <= input.now
      ? hoursBetween(input.lastMatchEndedAt, input.now)
      : null;
  const hoursSinceTravel =
    input.travelLegEndedAt && input.travelLegEndedAt <= input.now
      ? hoursBetween(input.travelLegEndedAt, input.now)
      : null;

  if (hoursToNext !== null && hoursToNext <= PRE_MATCH_WINDOW_HOURS) return 'pre-match';
  if (hoursSinceLast !== null && hoursSinceLast <= POST_MATCH_WINDOW_HOURS) return 'post-match';
  if (
    (hoursSinceTravel !== null && hoursSinceTravel <= TRAVEL_WINDOW_HOURS) ||
    (input.travelToday && input.localHour >= LATE_TRAVEL_HOUR)
  ) {
    return 'travel';
  }
  if (hoursToNext !== null && hoursToNext > REST_THRESHOLD_HOURS && !input.travelToday) {
    return 'rest';
  }
  return 'practice';
}

export const MODE_LABEL: Record<FuelMode, string> = {
  'pre-match': 'Pre-match',
  'post-match': 'Post-match',
  travel: 'Travel',
  rest: 'Rest',
  practice: 'Practice',
};

// FU-6: the badge tooltip states the rule.
export const MODE_RULE: Record<FuelMode, string> = {
  'pre-match':
    'Under 16 hours to a match: light, familiar, carbohydrate-forward, nothing fried or heavy.',
  'post-match': 'A match ended under 6 hours ago: protein first, with fluids and salt.',
  travel: 'Just off a travel leg: something warm, small and quick to digest.',
  rest: 'Next match more than 36 hours away: heavy and fried are fine tonight.',
  practice: 'No match in the next 16 hours: balanced, nothing fried or heavy.',
};

// The line the extractor is given so each dish's why sentence is written
// for tonight's mode (section 7's per-mode guidance).
export const MODE_GUIDANCE: Record<FuelMode, string> = {
  'pre-match':
    'Pre-match: a match starts within 16 hours. Favour light, familiar, carbohydrate-forward dishes; nothing fried or heavy.',
  'post-match': 'Post-match: a match ended within 6 hours. Lead with protein, fluids and salt.',
  travel: 'Travel: just off a travel leg. Favour something warm, small and quick to digest.',
  rest: 'Rest: the next match is more than 36 hours away. Heavy and fried dishes are fine.',
  practice: 'Practice: no match soon. Balanced dishes; nothing fried or heavy.',
};
