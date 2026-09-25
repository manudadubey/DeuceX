import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { FakeDb } from '../test-support/fake-db';
import { createFixtureWeatherAdapter } from './fixture-adapter';
import { computeNoteStamp } from './stamp';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

function seedEnteredTournament(fake: FakeDb) {
  fake.tables.tournaments = [
    {
      id: 'genoa',
      name: 'Genoa',
      surface: 'clay',
      indoor_outdoor: 'outdoor',
      city: 'Genoa',
      lat: 44.4,
      lon: 8.9,
      altitude_m: 20,
      ball: 'Dunlop Fort',
      start_date: '2026-09-08',
      end_date: '2026-09-14',
    },
  ];
  fake.tables.entry_decisions = [
    { player_id: 'player-1', tournament_id: 'genoa', status: 'entered' },
  ];
}

describe('computeNoteStamp · CE-11', () => {
  it('produces a stamp when the switch is on and the date falls inside an Entered event', async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1' }] });
    seedEnteredTournament(fake);

    const cond = await computeNoteStamp(
      {
        db: asDb(fake),
        weatherAdapter: createFixtureWeatherAdapter({
          tempMaxC: 24,
          tempMinC: 20,
          rhMinPct: 50,
          rhMaxPct: 58,
          windMinKmh: 5,
          windMaxKmh: 10,
        }),
      },
      'player-1',
      '2026-09-11T18:42:00Z',
    );

    expect(cond).toEqual(['24°C', '58% RH', 'outdoor clay', 'Dunlop Fort', 'Genoa']);
  });

  it('is null when the stamp switch is off', async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1' }] });
    seedEnteredTournament(fake);
    fake.tables.equipment_profile = [{ player_id: 'player-1', stamp_switch: false }];

    const cond = await computeNoteStamp(
      { db: asDb(fake), weatherAdapter: createFixtureWeatherAdapter() },
      'player-1',
      '2026-09-11T18:42:00Z',
    );
    expect(cond).toBeNull();
  });

  it('is null when no Entered event covers the date', async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1' }] });
    // No entry_decisions/tournaments seeded at all.

    const cond = await computeNoteStamp(
      { db: asDb(fake), weatherAdapter: createFixtureWeatherAdapter() },
      'player-1',
      '2026-09-11T18:42:00Z',
    );
    expect(cond).toBeNull();
  });

  it('is null when the forecast is unavailable (never falls back to normals for a stamp)', async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1' }] });
    seedEnteredTournament(fake);

    const cond = await computeNoteStamp(
      { db: asDb(fake), weatherAdapter: createFixtureWeatherAdapter(null) },
      'player-1',
      '2026-09-11T18:42:00Z',
    );
    expect(cond).toBeNull();
  });
});
