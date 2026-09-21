import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import { describe, expect, it } from 'vitest';
import { FakeDb } from '../test-support/fake-db';
import {
  listReminderEligiblePlayers,
  playersDueThisWeekAtHour,
  sendReserveReminderNotification,
  type ReminderEligiblePlayer,
} from './scheduler';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

describe('playersDueThisWeekAtHour', () => {
  it('includes only players whose local time is Sunday 20:00 by default', () => {
    // 2026-09-20 10:00 UTC (a Sunday) is 20:00 Sunday in Sydney (+10) and
    // 03:00 Sunday in Los Angeles (-7, DST) — not due yet in LA.
    const now = new Date('2026-09-20T10:00:00Z');
    const players: ReminderEligiblePlayer[] = [
      { id: 'sydney', timezone: 'Australia/Sydney' },
      { id: 'la', timezone: 'America/Los_Angeles' },
    ];

    const due = playersDueThisWeekAtHour(players, now);

    expect(due.map((p) => p.id)).toEqual(['sydney']);
  });

  it('does not fire on a different day at the same local hour', () => {
    // 2026-09-19 10:00 UTC (a Saturday) is 20:00 Saturday in Sydney — right
    // hour, wrong day.
    const now = new Date('2026-09-19T10:00:00Z');
    const players: ReminderEligiblePlayer[] = [{ id: 'sydney', timezone: 'Australia/Sydney' }];

    expect(playersDueThisWeekAtHour(players, now)).toEqual([]);
  });

  it('a custom target day/hour is honoured', () => {
    const now = new Date('2026-09-21T06:00:00Z'); // Monday 06:00 UTC = Monday 16:00 Sydney
    const players: ReminderEligiblePlayer[] = [{ id: 'sydney', timezone: 'Australia/Sydney' }];

    const due = playersDueThisWeekAtHour(players, now, { dayOfWeek: 1, hour: 16 });

    expect(due.map((p) => p.id)).toEqual(['sydney']);
  });
});

describe('listReminderEligiblePlayers', () => {
  it('excludes a player whose financial agent schedule is paused', async () => {
    const fake = new FakeDb();
    fake.tables.players = [
      { id: 'active', timezone: 'Australia/Sydney' },
      { id: 'paused', timezone: 'Australia/Sydney' },
    ];
    fake.tables.agent_schedules = [{ player_id: 'paused', agent_name: 'financial', paused: true }];

    const players = await listReminderEligiblePlayers(asDb(fake));

    expect(players.map((p) => p.id)).toEqual(['active']);
  });

  it('includes a player with no agent_schedules row at all (no row = not paused)', async () => {
    const fake = new FakeDb();
    fake.tables.players = [{ id: 'active', timezone: 'Australia/Sydney' }];

    const players = await listReminderEligiblePlayers(asDb(fake));

    expect(players.map((p) => p.id)).toEqual(['active']);
  });
});

describe('sendReserveReminderNotification', () => {
  it('inserts an fyi notification for the financial agent', async () => {
    const fake = new FakeDb();

    await sendReserveReminderNotification(asDb(fake), 'player-1');

    expect(fake.tables.notifications).toEqual([
      expect.objectContaining({
        player_id: 'player-1',
        agent: 'financial',
        category: 'fyi',
        action_href: '/agent/financial',
      }),
    ]);
  });
});
