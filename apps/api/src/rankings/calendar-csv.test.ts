import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { FakeDb } from '../test-support/fake-db';
import { CALENDAR_HEADER, InvalidCalendarCsvError, parseCalendarCsv } from './calendar-csv';
import { applyCalendarImport, previewCalendarImport } from './calendar-import';

const HEADER = CALENDAR_HEADER.join(',');
const POZNAN =
  'atp,Challenger Poznań,CH 75,clay,outdoor,Poznań,POL,52.4,16.9,,2026-10-12,2026-10-18,2026-09-18,420,Dunlop Fort,USD,"R1:1620;R2:2400;QF:3900;SF:6400","R1:0;R2:7;QF:15;SF:29"';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

describe('parseCalendarCsv', () => {
  it('reads an event with its prize table in the published currency', () => {
    const [row] = parseCalendarCsv(`${HEADER}\n${POZNAN}`);
    expect(row).toMatchObject({
      tour: 'atp',
      name: 'Challenger Poznań',
      tier: 'CH 75',
      surface: 'clay',
      country: 'POL',
      startDate: '2026-10-12',
      entryDeadline: '2026-09-18',
      lastYearCut: 420,
      prizeCurrency: 'USD',
      prizeTable: { R1: 1620, R2: 2400, QF: 3900, SF: 6400 },
      pointsTable: { R1: 0, R2: 7, QF: 15, SF: 29 },
    });
  });

  it('names the line and the problem for bad input', () => {
    expect(() =>
      parseCalendarCsv(`${HEADER}\n${POZNAN.replace('2026-10-18', '2026-10-01')}`),
    ).toThrow(/Line 2: end_date is before start_date/);
    expect(() => parseCalendarCsv(`${HEADER}\n${POZNAN.replace('R1:1620', 'R9:1620')}`)).toThrow(
      /Line 2: prize round "R9"/,
    );
    expect(() => parseCalendarCsv(`${HEADER}\n${POZNAN.replace(',USD,', ',dollars,')}`)).toThrow(
      /prize_currency/,
    );
    expect(() => parseCalendarCsv('tour,name\natp,X')).toThrow(InvalidCalendarCsvError);
  });
});

describe('calendar import', () => {
  it('inserts new events, then treats a re-import as unchanged and a changed deadline as an update', async () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [];
    const rows = parseCalendarCsv(`${HEADER}\n${POZNAN}`);

    const first = await applyCalendarImport(asDb(fake), rows);
    expect(first).toMatchObject({ newCount: 1, updateCount: 0 });
    expect(fake.tables.tournaments).toHaveLength(1);
    expect(fake.tables.tournaments![0]).toMatchObject({ prize_currency: 'USD', tier: 'CH 75' });

    expect(await previewCalendarImport(asDb(fake), rows)).toMatchObject({ unchangedCount: 1 });

    // As Postgres returns it: jsonb keys reordered, numerics as strings.
    const stored = fake.tables.tournaments![0]!;
    stored.prize_table = { SF: 6400, QF: 3900, R1: 1620, R2: 2400 };
    stored.lat = '52.4';
    expect(await previewCalendarImport(asDb(fake), rows)).toMatchObject({ unchangedCount: 1 });

    const moved = parseCalendarCsv(`${HEADER}\n${POZNAN.replace('2026-09-18', '2026-09-19')}`);
    const plan = await previewCalendarImport(asDb(fake), moved);
    expect(plan.entries[0]).toMatchObject({ action: 'update', changedFields: ['entry_deadline'] });
    await applyCalendarImport(asDb(fake), moved);
    expect(fake.tables.tournaments).toHaveLength(1);
    expect(fake.tables.tournaments![0]!.entry_deadline).toBe('2026-09-19');
  });
});
