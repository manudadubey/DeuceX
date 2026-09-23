// players.blocked_dates (step 1.4's onboarding wizard) is a single free-text
// column — a player types "26 Oct – 1 Nov · coach block, Vienna" into a
// plain text field, not a structured date-range picker (no such picker
// exists yet in this codebase; the prototype's own blocked-dates chip is
// hard-coded copy, not a parsed value). T-2's blocked-dates filter needs an
// actual date range to compare against, so this is a best-effort parser: it
// recognises the "D Mon [– to -] D Mon" shape PRD-01's own fixtures use
// (with an optional trailing note after a comma, dot or middle dot, which is
// discarded) and returns no ranges at all when it cannot confidently parse
// the text, rather than guessing wrong and silently hiding real weeks from
// the shortlist. A real structured blocked-dates table is a named follow-up
// (see docs/BUILD-LOG.md's step 3.2 entry), not attempted here.

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const RANGE_PATTERN = /(\d{1,2})\s+([A-Za-z]{3,})\s*(?:[-–—]|to)\s*(\d{1,2})\s+([A-Za-z]{3,})/i;

function toIsoDate(day: number, monthName: string, year: number): string | null {
  const month = MONTHS[monthName.slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  const date = new Date(Date.UTC(year, month, day));
  return date.toISOString().slice(0, 10);
}

export interface DateRange {
  start: string;
  end: string;
}

// `referenceDate` resolves which year a bare "26 Oct – 1 Nov" (no year in
// the text at all, the only shape the onboarding wizard's free-text field
// actually produces) means: the next upcoming occurrence of that month/day
// pair from referenceDate, rolling into next year if the range's start has
// already passed this year. A range that spans a year boundary (end month
// earlier than start month, e.g. "28 Dec – 3 Jan") gets its end year bumped
// by one.
export function parseBlockedDateRanges(
  blockedDates: string | null,
  referenceDate: Date = new Date(),
): DateRange[] {
  if (!blockedDates) return [];
  const match = RANGE_PATTERN.exec(blockedDates);
  if (!match) return [];
  const [, startDay, startMonth, endDay, endMonth] = match;
  if (!startDay || !startMonth || !endDay || !endMonth) return [];

  const currentYear = referenceDate.getUTCFullYear();
  let start = toIsoDate(Number(startDay), startMonth, currentYear);
  if (!start) return [];
  if (start < referenceDate.toISOString().slice(0, 10)) {
    start = toIsoDate(Number(startDay), startMonth, currentYear + 1);
  }
  if (!start) return [];

  const startYear = Number(start.slice(0, 4));
  const startMonthIndex = MONTHS[startMonth.slice(0, 3).toLowerCase()] ?? 0;
  const endMonthIndex = MONTHS[endMonth.slice(0, 3).toLowerCase()] ?? 0;
  const endYear = endMonthIndex < startMonthIndex ? startYear + 1 : startYear;
  const end = toIsoDate(Number(endDay), endMonth, endYear);
  if (!end) return [];

  return [{ start, end }];
}
