import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import { describe, expect, it } from 'vitest';
import { FakeDb } from '../test-support/fake-db';
import { listSchedulablePlayers, playersDueThisHour, type SchedulablePlayer } from './scheduler';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

describe('playersDueThisHour', () => {
  it('includes only players whose local time is inside the delivery hour', () => {
    // 2026-09-21T20:00:00Z is 06:00 in Sydney (+10) and 22:00 in Los Angeles (-8, DST).
    const now = new Date('2026-09-21T20:00:00Z');
    const players: SchedulablePlayer[] = [
      { id: 'sydney', timezone: 'Australia/Sydney' },
      { id: 'la', timezone: 'America/Los_Angeles' },
    ];

    const due = playersDueThisHour(players, now);

    expect(due.map((p) => p.id)).toEqual(['sydney']);
  });
});

describe('listSchedulablePlayers', () => {
  it('excludes a player with fewer than three lifetime saved notes (onboarding gate)', async () => {
    const fake = new FakeDb();
    fake.tables.players = [
      { id: 'ready', timezone: 'Australia/Sydney' },
      { id: 'not-ready', timezone: 'Australia/Sydney' },
    ];
    fake.tables.notes = [
      ...['a', 'b', 'c'].map((id) => ({ id, player_id: 'ready', status: 'saved' })),
      { id: 'x', player_id: 'not-ready', status: 'saved' },
    ];

    const players = await listSchedulablePlayers(asDb(fake));

    expect(players.map((p) => p.id)).toEqual(['ready']);
  });
});
