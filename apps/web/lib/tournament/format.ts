import { FLAG_CODES, placeFlag, type FlagCode } from '@deucex/ui';

// Display formats shared by the Tournament page, its detail panel and the
// dashboard decision card, matching the prototype ("12–18 Oct", "Sat 3 Oct").

export const SURFACES: Record<string, string> = {
  clay: 'Clay',
  hard: 'Hard',
  indoor_hard: 'Indoor hard',
  grass: 'Grass',
};

export function surfaceLabel(surface: string | null): string | null {
  return surface ? (SURFACES[surface] ?? surface) : null;
}

export function flagFor(country: string | null, city: string | null): FlagCode | null {
  const code = country?.toUpperCase();
  if (code && (FLAG_CODES as readonly string[]).includes(code)) return code as FlagCode;
  return city ? placeFlag(city) : null;
}

export function utc(iso: string): Date {
  return new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
}

/** "12–18 Oct", or "28 Sep – 4 Oct" across a month. */
export function dateRange(start: string, end: string): string {
  const s = utc(start);
  const e = utc(end);
  const month = (d: Date) =>
    d.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' }).replace('Sept', 'Sep');
  return s.getUTCMonth() === e.getUTCMonth()
    ? `${s.getUTCDate()}–${e.getUTCDate()} ${month(e)}`
    : `${s.getUTCDate()} ${month(s)} – ${e.getUTCDate()} ${month(e)}`;
}

export function dayLabel(iso: string): string {
  return utc(iso)
    .toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
    .replace('Sept', 'Sep');
}

/** "Sun 27 Sep 20:00" in UTC, as the prototype's run line. */
export function runStamp(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `${dayLabel(iso.slice(0, 10))} ${time}`;
}

export function nextSunday(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 20));
  const ahead = (7 - d.getUTCDay()) % 7;
  d.setUTCDate(d.getUTCDate() + ahead);
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return dayLabel(d.toISOString().slice(0, 10));
}

export function isoWeek(iso: string): number {
  const d = utc(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return (
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    )
  );
}

const ACCEPTANCE: Record<string, string> = {
  direct: 'Direct acceptance',
  alternate: 'Alternate list',
  qualifying: 'Qualifying likely',
};

/** T-8's chip label for an acceptance status. */
export function acceptanceChip(status: string): string {
  return ACCEPTANCE[status] ?? status.replace(/_/g, ' ');
}

/** Runway for display: past a year the exact week count is noise ("2822.3 wks"). */
export function runwayLabel(weeks: number): string {
  if (!Number.isFinite(weeks) || weeks >= 104) return 'over two years';
  if (weeks >= 52) return 'over a year';
  return `${weeks.toFixed(1)} wks`;
}
