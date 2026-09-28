import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { FakeDb } from '../test-support/fake-db';
import { calendarSummary } from './calendar-summary';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

describe('calendarSummary', () => {
  it('counts upcoming events by tour, the next deadline and the last import', async () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [
      // Finished yesterday: not upcoming.
      {
        tour: 'itf_men',
        start_date: '2026-09-21',
        end_date: '2026-09-27',
        entry_deadline: '2026-09-03',
      },
      {
        tour: 'itf_women',
        start_date: '2026-10-19',
        end_date: '2026-10-25',
        entry_deadline: '2026-10-01',
      },
      {
        tour: 'itf_men',
        start_date: '2026-10-19',
        end_date: '2026-10-25',
        entry_deadline: '2026-10-01',
      },
      {
        tour: 'itf_men',
        start_date: '2026-09-28',
        end_date: '2026-10-04',
        entry_deadline: '2026-09-10',
      },
      { tour: 'atp', start_date: '2026-12-07', end_date: '2026-12-13', entry_deadline: null },
    ];
    fake.tables.admin_actions = [
      {
        action_type: 'calendar_import',
        created_at: '2026-09-20T01:00:00Z',
        admin_name: 'A',
        target: { newCount: 5, updateCount: 0 },
      },
      {
        action_type: 'calendar_import',
        created_at: '2026-09-28T04:27:18Z',
        admin_name: 'Manu Dubey',
        target: { newCount: 302, updateCount: 0 },
      },
      {
        action_type: 'deadline_set',
        created_at: '2026-09-28T05:00:00Z',
        admin_name: 'B',
        target: {},
      },
    ];

    expect(await calendarSummary(asDb(fake), '2026-09-28')).toEqual({
      upcomingCount: 4,
      byTour: [
        { tour: 'atp', count: 1 },
        { tour: 'itf_men', count: 2 },
        { tour: 'itf_women', count: 1 },
      ],
      firstStart: '2026-09-28',
      lastStart: '2026-12-07',
      nextDeadline: { date: '2026-10-01', count: 2 },
      missingDeadlineCount: 1,
      lastImport: { at: '2026-09-28T04:27:18Z', by: 'Manu Dubey', newCount: 302, updateCount: 0 },
    });
  });

  it('reports an empty calendar with no import on record', async () => {
    const fake = new FakeDb();
    fake.tables.tournaments = [];
    fake.tables.admin_actions = [];
    expect(await calendarSummary(asDb(fake), '2026-09-28')).toMatchObject({
      upcomingCount: 0,
      byTour: [],
      nextDeadline: null,
      lastImport: null,
    });
  });
});
