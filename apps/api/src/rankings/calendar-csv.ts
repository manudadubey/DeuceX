import { parseCsvLine } from './csv';

// The calendar import (28 September 2026, owner decision): until a licensed
// ATP/ITF calendar feed is signed, staff paste the next weeks of events here,
// the same manual-path-first shape as the ranking CSV (step 3.1). Nothing else
// in the codebase creates a tournaments row, so without this the Tournament
// Agent has nothing to shortlist.
//
// Prize and points tables are one field each, "R1:1620;R2:2400;QF:3900", keyed
// by the round labels the shortlist engine reads (Q1 to SF). Prize amounts are
// kept in the currency the event publishes (prize_currency, e.g. USD for ITF
// and Challenger events) and converted at run time, never stored converted.

export const CALENDAR_TOURS = ['atp', 'wta', 'itf_men', 'itf_women'] as const;
export const CALENDAR_SURFACES = ['clay', 'hard', 'indoor_hard', 'grass'] as const;
export const ROUND_LABELS = [
  'Q1',
  'Q2',
  'Q3',
  'R1',
  'R2',
  'R3',
  'R4',
  'QF',
  'SF',
  'F',
  'W',
] as const;

export interface CalendarRow {
  tour: (typeof CALENDAR_TOURS)[number];
  name: string;
  tier: string;
  surface: (typeof CALENDAR_SURFACES)[number] | null;
  indoorOutdoor: 'indoor' | 'outdoor' | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  altitudeM: number | null;
  startDate: string;
  endDate: string;
  entryDeadline: string | null;
  lastYearCut: number | null;
  ball: string | null;
  prizeCurrency: string;
  prizeTable: Record<string, number>;
  pointsTable: Record<string, number>;
}

export const CALENDAR_HEADER = [
  'tour',
  'name',
  'tier',
  'surface',
  'indoor_outdoor',
  'city',
  'country',
  'lat',
  'lon',
  'altitude_m',
  'start_date',
  'end_date',
  'entry_deadline',
  'last_year_cut',
  'ball',
  'prize_currency',
  'prize',
  'points',
] as const;

export class InvalidCalendarCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCalendarCsvError';
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function optional(value: string | undefined): string | null {
  const v = value?.trim() ?? '';
  return v === '' ? null : v;
}

function number(value: string | undefined, line: number, field: string): number | null {
  const v = optional(value);
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n))
    throw new InvalidCalendarCsvError(`Line ${line}: ${field} "${v}" is not a number`);
  return n;
}

function day(
  value: string | undefined,
  line: number,
  field: string,
  required: boolean,
): string | null {
  const v = optional(value);
  if (v === null) {
    if (required) throw new InvalidCalendarCsvError(`Line ${line}: ${field} is required`);
    return null;
  }
  if (!ISO_DAY.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())) {
    throw new InvalidCalendarCsvError(`Line ${line}: ${field} "${v}" must be YYYY-MM-DD`);
  }
  return v;
}

function roundTable(
  value: string | undefined,
  line: number,
  field: string,
): Record<string, number> {
  const v = optional(value);
  if (v === null) return {};
  const table: Record<string, number> = {};
  for (const part of v.split(';')) {
    const [label, amount] = part.split(':').map((s) => s.trim());
    if (!label) continue;
    if (!(ROUND_LABELS as readonly string[]).includes(label)) {
      throw new InvalidCalendarCsvError(
        `Line ${line}: ${field} round "${label}" must be one of ${ROUND_LABELS.join(', ')}`,
      );
    }
    const n = Number(amount);
    if (amount === undefined || amount === '' || !Number.isFinite(n) || n < 0) {
      throw new InvalidCalendarCsvError(
        `Line ${line}: ${field} ${label} needs a number, e.g. ${label}:1620`,
      );
    }
    table[label] = n;
  }
  return table;
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  line: number,
  field: string,
): T | null {
  const v = optional(value)?.toLowerCase() ?? null;
  if (v === null) return null;
  if (!(allowed as readonly string[]).includes(v)) {
    throw new InvalidCalendarCsvError(
      `Line ${line}: ${field} "${v}" must be one of ${allowed.join(', ')}`,
    );
  }
  return v as T;
}

export function parseCalendarCsv(text: string): CalendarRow[] {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) throw new InvalidCalendarCsvError('Empty file');
  const header = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const missing = CALENDAR_HEADER.filter((h) => !header.includes(h));
  if (missing.length) {
    throw new InvalidCalendarCsvError(`Missing columns: ${missing.join(', ')}`);
  }
  const at = (fields: string[], name: (typeof CALENDAR_HEADER)[number]) =>
    fields[header.indexOf(name)];

  return lines.slice(1).map((raw, i) => {
    const line = i + 2;
    const f = parseCsvLine(raw);
    const tour = oneOf(at(f, 'tour'), CALENDAR_TOURS, line, 'tour');
    if (!tour) throw new InvalidCalendarCsvError(`Line ${line}: tour is required`);
    const name = optional(at(f, 'name'));
    if (!name) throw new InvalidCalendarCsvError(`Line ${line}: name is required`);
    const tier = optional(at(f, 'tier'));
    if (!tier)
      throw new InvalidCalendarCsvError(
        `Line ${line}: tier is required, e.g. "CH 75" or "ITF M25"`,
      );
    const startDate = day(at(f, 'start_date'), line, 'start_date', true)!;
    const endDate = day(at(f, 'end_date'), line, 'end_date', true)!;
    if (endDate < startDate)
      throw new InvalidCalendarCsvError(`Line ${line}: end_date is before start_date`);
    const entryDeadline = day(at(f, 'entry_deadline'), line, 'entry_deadline', false);
    if (entryDeadline && entryDeadline > startDate) {
      throw new InvalidCalendarCsvError(`Line ${line}: entry_deadline is after start_date`);
    }
    const prizeCurrency = (optional(at(f, 'prize_currency')) ?? '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(prizeCurrency)) {
      throw new InvalidCalendarCsvError(
        `Line ${line}: prize_currency must be a three-letter code, e.g. USD`,
      );
    }
    const lastYearCut = number(at(f, 'last_year_cut'), line, 'last_year_cut');
    return {
      tour,
      name,
      tier,
      surface: oneOf(at(f, 'surface'), CALENDAR_SURFACES, line, 'surface'),
      indoorOutdoor: oneOf(
        at(f, 'indoor_outdoor'),
        ['indoor', 'outdoor'] as const,
        line,
        'indoor_outdoor',
      ),
      city: optional(at(f, 'city')),
      country: optional(at(f, 'country'))?.toUpperCase() ?? null,
      lat: number(at(f, 'lat'), line, 'lat'),
      lon: number(at(f, 'lon'), line, 'lon'),
      altitudeM: number(at(f, 'altitude_m'), line, 'altitude_m'),
      startDate,
      endDate,
      entryDeadline,
      lastYearCut: lastYearCut === null ? null : Math.round(lastYearCut),
      ball: optional(at(f, 'ball')),
      prizeCurrency,
      prizeTable: roundTable(at(f, 'prize'), line, 'prize'),
      pointsTable: roundTable(at(f, 'points'), line, 'points'),
    };
  });
}
