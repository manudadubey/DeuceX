import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { describe, expect, it } from 'vitest';
import { FakeDb } from '../test-support/fake-db';
import {
  effectiveReminderTarget,
  isWithinQuietHours,
  listReminderEligiblePlayers,
  playersDueThisWeekAtHour,
  sendReserveReminderNotification,
  type ReminderEligiblePlayer,
} from './scheduler';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

const NO_QUIET_HOURS: Pick<ReminderEligiblePlayer, 'quietHoursStartHour' | 'quietHoursEndHour'> = {
  quietHoursStartHour: 22,
  quietHoursEndHour: 7,
};

describe('isWithinQuietHours', () => {
  it('handles a window that does not wrap midnight', () => {
    expect(isWithinQuietHours(13, 12, 14)).toBe(true);
    expect(isWithinQuietHours(15, 12, 14)).toBe(false);
  });

  it('handles a window that wraps midnight (the default 22:00-07:00)', () => {
    expect(isWithinQuietHours(23, 22, 7)).toBe(true);
    expect(isWithinQuietHours(3, 22, 7)).toBe(true);
    expect(isWithinQuietHours(20, 22, 7)).toBe(false);
    expect(isWithinQuietHours(7, 22, 7)).toBe(false); // end hour itself is not quiet
  });

  it('treats a zero-length window as quiet hours off', () => {
    expect(isWithinQuietHours(3, 10, 10)).toBe(false);
  });
});

describe('effectiveReminderTarget', () => {
  it('keeps Sunday 20:00 when that is outside quiet hours (the default window)', () => {
    expect(effectiveReminderTarget(22, 7)).toEqual({ dayOfWeek: 0, hour: 20 });
  });

  it('holds delivery to quiet_hours_end, same day, for a non-wrapping window covering 20:00', () => {
    expect(effectiveReminderTarget(18, 23)).toEqual({ dayOfWeek: 0, hour: 23 });
  });

  it('holds delivery to quiet_hours_end the next day when the window wraps midnight and 20:00 is on the before-midnight side', () => {
    expect(effectiveReminderTarget(20, 8)).toEqual({ dayOfWeek: 1, hour: 8 });
  });
});

describe('playersDueThisWeekAtHour', () => {
  it('includes only players whose local time is Sunday 20:00 by default', () => {
    // 2026-09-20 10:00 UTC (a Sunday) is 20:00 Sunday in Sydney (+10) and
    // 03:00 Sunday in Los Angeles (-7, DST) — not due yet in LA.
    const now = new Date('2026-09-20T10:00:00Z');
    const players: ReminderEligiblePlayer[] = [
      { id: 'sydney', timezone: 'Australia/Sydney', ...NO_QUIET_HOURS },
      { id: 'la', timezone: 'America/Los_Angeles', ...NO_QUIET_HOURS },
    ];

    const due = playersDueThisWeekAtHour(players, now);

    expect(due.map((p) => p.id)).toEqual(['sydney']);
  });

  it('does not fire on a different day at the same local hour', () => {
    // 2026-09-19 10:00 UTC (a Saturday) is 20:00 Saturday in Sydney — right
    // hour, wrong day.
    const now = new Date('2026-09-19T10:00:00Z');
    const players: ReminderEligiblePlayer[] = [
      { id: 'sydney', timezone: 'Australia/Sydney', ...NO_QUIET_HOURS },
    ];

    expect(playersDueThisWeekAtHour(players, now)).toEqual([]);
  });

  it('holds a player whose quiet hours cover the default 20:00 slot until their own quiet_hours_end', () => {
    // 2026-09-20 10:00 UTC = 20:00 Sunday Sydney, this player's quiet hours.
    const now = new Date('2026-09-20T10:00:00Z');
    const players: ReminderEligiblePlayer[] = [
      {
        id: 'night-owl',
        timezone: 'Australia/Sydney',
        quietHoursStartHour: 18,
        quietHoursEndHour: 23,
      },
    ];

    expect(playersDueThisWeekAtHour(players, now)).toEqual([]);

    // 2026-09-20 13:00 UTC = 23:00 Sunday Sydney, this player's quiet_hours_end.
    const laterNow = new Date('2026-09-20T13:00:00Z');
    expect(playersDueThisWeekAtHour(players, laterNow).map((p) => p.id)).toEqual(['night-owl']);
  });
});

describe('listReminderEligiblePlayers', () => {
  it('excludes a player whose financial agent schedule is paused', async () => {
    const fake = new FakeDb();
    fake.tables.players = [
      {
        id: 'active',
        timezone: 'Australia/Sydney',
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00',
        reserve_reminder_enabled: true,
      },
      {
        id: 'paused',
        timezone: 'Australia/Sydney',
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00',
        reserve_reminder_enabled: true,
      },
    ];
    fake.tables.agent_schedules = [{ player_id: 'paused', agent_name: 'financial', paused: true }];

    const players = await listReminderEligiblePlayers(asDb(fake));

    expect(players.map((p) => p.id)).toEqual(['active']);
  });

  it('excludes a player who has turned the reminder off', async () => {
    const fake = new FakeDb();
    fake.tables.players = [
      {
        id: 'on',
        timezone: 'Australia/Sydney',
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00',
        reserve_reminder_enabled: true,
      },
      {
        id: 'off',
        timezone: 'Australia/Sydney',
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00',
        reserve_reminder_enabled: false,
      },
    ];

    const players = await listReminderEligiblePlayers(asDb(fake));

    expect(players.map((p) => p.id)).toEqual(['on']);
  });

  it('includes a player with no agent_schedules row at all (no row = not paused)', async () => {
    const fake = new FakeDb();
    fake.tables.players = [
      {
        id: 'active',
        timezone: 'Australia/Sydney',
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00',
        reserve_reminder_enabled: true,
      },
    ];

    const players = await listReminderEligiblePlayers(asDb(fake));

    expect(players.map((p) => p.id)).toEqual(['active']);
    expect(players[0]).toMatchObject({ quietHoursStartHour: 22, quietHoursEndHour: 7 });
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
