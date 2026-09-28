// Converts ITF's World Tennis Tour calendar export (one CSV per tour, the
// columns itftennis.com's calendar lists) into the admin console's Tournament
// calendar import format (apps/api/src/rankings/calendar-csv.ts). Staff then
// paste the output into Ingestion > Tournament calendar import, which keeps
// the preview, the reason and the audit row; this script writes nothing.
//
// ITF's calendar has no per-round prize or points, and no entry deadline, so
// they come from the 2026 World Tennis Tour Regulations
// (itftennis.com/media/15546/2026-wtt-regulations.pdf):
// - Appendix H (men's prize money), Appendix I (ATP points),
//   Appendix J (women's prize money, 32 main draw), Appendix K (WTA points).
//   Update these tables when ITF publishes the next year's regulations.
// - "The Entry Deadline is at 14:00 (GMT) on the Thursday eighteen (18) days
//   prior to the Monday of the Tournament week."
//
// Round labels follow the shortlist engine (packages/agents rounds.ts): each
// label is what a player earns for losing in that round. In a 32 main draw R1
// is the round of 32 and R2 the round of 16. Qualifying is a 32 draw of two
// rounds (Q1, then the final round as Q2). Qualifying points are ITF World
// Tennis points, not ATP or WTA points, so they're 0 here, except the WTA's
// own qualifying-finalist points at W50 and above.
//
// Known approximations, both from what the export leaves out:
// - Draw size: W35 to W100 events can be 48 draws; the 32 draw table is used.
// - Currency: European events may pay the regulations' euro table; the export
//   says USD for every event, so USD is used.
// - No coordinates or altitude, so Conditions falls back until they're added.
//
// Usage:
//   pnpm --filter @deucex/api exec tsx scripts/itf-calendar.ts \
//     <men.csv> <women.csv> [--from YYYY-MM-DD] > calendar-import.csv
// --from defaults to today (UTC); earlier and cancelled events are left out.

import { readFileSync } from 'node:fs';
import { CALENDAR_HEADER } from '../src/rankings/calendar-csv';
import { parseCsvLine } from '../src/rankings/csv';

type Table = Record<string, number>;

const PRIZE_USD: Record<string, Table> = {
  M15: { Q1: 0, Q2: 0, R1: 156, R2: 258, QF: 438, SF: 753, F: 1272, W: 2160 },
  M25: { Q1: 0, Q2: 0, R1: 319, R2: 495, QF: 905, SF: 1550, F: 2701, W: 4612 },
  W15: { Q1: 0, Q2: 0, R1: 147, R2: 294, QF: 367, SF: 734, F: 1470, W: 2352 },
  W35: { Q1: 50, Q2: 96.5, R1: 297, R2: 462, QF: 830, SF: 1428, F: 2637, W: 4860 },
  W50: { Q1: 64, Q2: 124, R1: 383, R2: 598, QF: 1069, SF: 1842, F: 3395, W: 6260 },
  W75: { Q1: 141.75, Q2: 228.75, R1: 557, R2: 935, QF: 1543, SF: 2683, F: 4886, W: 9142 },
  W100: { Q1: 237, Q2: 381.75, R1: 926, R2: 1559, QF: 2573, SF: 4473, F: 8147, W: 15239 },
};

const POINTS: Record<string, Table> = {
  M15: { Q1: 0, Q2: 0, R1: 0, R2: 1, QF: 2, SF: 4, F: 8, W: 15 },
  M25: { Q1: 0, Q2: 0, R1: 0, R2: 1, QF: 3, SF: 7, F: 14, W: 25 },
  W15: { Q1: 0, Q2: 0, R1: 0, R2: 1, QF: 3, SF: 6, F: 10, W: 15 },
  W35: { Q1: 0, Q2: 0, R1: 0, R2: 4, QF: 8, SF: 14, F: 23, W: 35 },
  W50: { Q1: 0, Q2: 1, R1: 1, R2: 6, QF: 11, SF: 20, F: 33, W: 50 },
  W75: { Q1: 0, Q2: 2, R1: 1, R2: 9, QF: 16, SF: 29, F: 49, W: 75 },
  W100: { Q1: 0, Q2: 3, R1: 1, R2: 12, QF: 21, SF: 39, F: 65, W: 100 },
};

const SURFACES: Record<string, string> = { hard: 'hard', clay: 'clay', grass: 'grass' };
const SKIPPED_STATUSES = new Set(['cancelled', 'postponed']);
const CANCELLED_NAME = /\b(cancell?ed|postponed)\b/i;

function table(t: Table): string {
  return Object.entries(t)
    .map(([round, n]) => `${round}:${n}`)
    .join(';');
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function entryDeadline(startDate: string): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  return new Date(monday.getTime() - 18 * 86_400_000).toISOString().slice(0, 10);
}

function convert(path: string, from: string): { rows: string[]; skipped: string[] } {
  const lines = readFileSync(path, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim() !== '');
  const header = parseCsvLine(lines[0]!).map((h) => h.trim());
  const rows: string[] = [];
  const skipped: string[] = [];
  for (const raw of lines.slice(1)) {
    const f = parseCsvLine(raw);
    const at = (name: string) => (f[header.indexOf(name)] ?? '').trim();
    const name = at('Tournament');
    const start = at('Start Date');
    if (start < from || SKIPPED_STATUSES.has(at('Status').toLowerCase())) continue;
    // ITF sometimes marks a cancellation only in the name ("M25 Stillwater
    // CANCELLED") and leaves Status as Scheduled; two such events reached
    // production on 28 September 2026 before this check existed.
    if (CANCELLED_NAME.test(name)) {
      skipped.push(`${name}: cancelled (in the name)`);
      continue;
    }
    // The name's own prefix ("M25+H Bagnères", "W35 Sharm ElSheikh") wins over
    // the Category column, which has at least one stale value (a W35 listed as W25).
    const prefix = /^([MW]\d+)/.exec(name.toUpperCase())?.[1];
    const category = prefix && PRIZE_USD[prefix] ? prefix : at('Category').toUpperCase();
    const prize = PRIZE_USD[category];
    const points = POINTS[category];
    if (!prize || !points) {
      skipped.push(`${name}: no table for category ${category}`);
      continue;
    }
    const indoor = at('Indoor/Outdoor').toLowerCase();
    const baseSurface = SURFACES[at('Surface').toLowerCase()] ?? '';
    const surface = baseSurface === 'hard' && indoor === 'indoor' ? 'indoor_hard' : baseSurface;
    const out: Record<(typeof CALENDAR_HEADER)[number], string> = {
      tour: category.startsWith('M') ? 'itf_men' : 'itf_women',
      name,
      tier: `ITF ${category}`,
      surface,
      indoor_outdoor: indoor === 'indoor' || indoor === 'outdoor' ? indoor : '',
      city: at('Venue'),
      country: at('Code'),
      lat: '',
      lon: '',
      altitude_m: '',
      start_date: start,
      end_date: at('End Date'),
      entry_deadline: entryDeadline(start),
      last_year_cut: '',
      ball: '',
      prize_currency: 'USD',
      prize: table(prize),
      points: table(points),
    };
    rows.push(CALENDAR_HEADER.map((h) => csvField(out[h])).join(','));
  }
  return { rows, skipped };
}

const args = process.argv.slice(2);
const fromIndex = args.indexOf('--from');
const from = fromIndex >= 0 ? args[fromIndex + 1]! : new Date().toISOString().slice(0, 10);
const files = args.filter((_, i) => i !== fromIndex && i !== fromIndex + 1);
if (files.length === 0) throw new Error('Pass one or more ITF calendar CSV files');

const results = files.map((path) => ({ path, ...convert(path, from) }));
process.stdout.write(
  [CALENDAR_HEADER.join(','), ...results.flatMap((r) => r.rows)].join('\n') + '\n',
);
for (const r of results) {
  process.stderr.write(`${r.path}: ${r.rows.length} events from ${from}\n`);
  for (const s of r.skipped) process.stderr.write(`  skipped ${s}\n`);
}
