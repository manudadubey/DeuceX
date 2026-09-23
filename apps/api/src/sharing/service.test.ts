import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import { describe, expect, it } from 'vitest';
import { FakeDb } from '../test-support/fake-db';
import {
  SupabaseSharingDb,
  resolveShareLink,
  type ActiveShareLink,
  type CoachViewData,
  type ManagerViewData,
  type SharingDb,
} from './service';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

const COACH_STUB: CoachViewData = {
  scope: 'coach',
  playerName: 'Arya Dubey',
  matches: [],
  patterns: [],
  shortlistAvailable: false,
  conditionsAvailable: false,
};

const MANAGER_STUB: ManagerViewData = {
  scope: 'manager',
  playerName: 'Arya Dubey',
  homeCurrency: 'AUD',
  reserves: 9450,
  grossWeeklySpend: 400,
  netBurn: 400,
  runwayWeeks: 23.6,
  runwayColour: 'green',
  monthlyPnl: { income: 0, spend: 400, net: -400 },
  expenses: [],
  patronsAvailable: false,
};

function fakeSharingDb(link: ActiveShareLink | null): SharingDb & { openedIds: string[] } {
  const openedIds: string[] = [];
  return {
    openedIds,
    async findActiveLink() {
      return link;
    },
    async recordOpen(linkId) {
      openedIds.push(linkId);
    },
    async getCoachData() {
      return COACH_STUB;
    },
    async getManagerData() {
      return MANAGER_STUB;
    },
  };
}

describe('resolveShareLink', () => {
  it('returns null without recording an open for an unknown, revoked or expired token', async () => {
    const db = fakeSharingDb(null);

    const result = await resolveShareLink(db, 'no-such-token');

    expect(result).toBeNull();
    expect(db.openedIds).toEqual([]);
  });

  it('bumps the open count before returning the coach DTO for a coach-scope link', async () => {
    const db = fakeSharingDb({ id: 'link-1', playerId: 'player-1', scope: 'coach' });

    const result = await resolveShareLink(db, 'tok-1');

    expect(result).toEqual(COACH_STUB);
    expect(db.openedIds).toEqual(['link-1']);
  });

  it('returns the manager DTO for a manager-scope link', async () => {
    const db = fakeSharingDb({ id: 'link-2', playerId: 'player-1', scope: 'manager' });

    const result = await resolveShareLink(db, 'tok-2');

    expect(result).toEqual(MANAGER_STUB);
  });
});

describe('SupabaseSharingDb.findActiveLink', () => {
  it('refuses a revoked link', async () => {
    const fake = new FakeDb();
    fake.tables.share_links = [
      {
        id: 'link-1',
        token: 'tok-1',
        player_id: 'player-1',
        scope: 'coach',
        revoked: true,
        expires_at: '2099-01-01T00:00:00Z',
      },
    ];
    const db = new SupabaseSharingDb(asDb(fake));

    expect(await db.findActiveLink('tok-1', new Date('2026-09-23T00:00:00Z'))).toBeNull();
  });

  it('refuses an expired link', async () => {
    const fake = new FakeDb();
    fake.tables.share_links = [
      {
        id: 'link-1',
        token: 'tok-1',
        player_id: 'player-1',
        scope: 'coach',
        revoked: false,
        expires_at: '2026-01-01T00:00:00Z',
      },
    ];
    const db = new SupabaseSharingDb(asDb(fake));

    expect(await db.findActiveLink('tok-1', new Date('2026-09-23T00:00:00Z'))).toBeNull();
  });

  it('accepts a live, unexpired link', async () => {
    const fake = new FakeDb();
    fake.tables.share_links = [
      {
        id: 'link-1',
        token: 'tok-1',
        player_id: 'player-1',
        scope: 'manager',
        revoked: false,
        expires_at: '2099-01-01T00:00:00Z',
      },
    ];
    const db = new SupabaseSharingDb(asDb(fake));

    expect(await db.findActiveLink('tok-1', new Date('2026-09-23T00:00:00Z'))).toEqual({
      id: 'link-1',
      playerId: 'player-1',
      scope: 'manager',
    });
  });
});

describe('SupabaseSharingDb.getCoachData', () => {
  it('never leaks transcript, audio_ref or mood even when the underlying note row has them', async () => {
    const fake = new FakeDb();
    fake.tables.players = [{ id: 'player-1', name: 'Arya Dubey' }];
    fake.tables.notes = [
      {
        id: 'note-1',
        player_id: 'player-1',
        ctx: 'match',
        coach_share: true,
        recorded_at: '2026-09-20T10:00:00Z',
        result: 'W 6-4 6-3',
        opponent: 'Kovalenko',
        tags: ['second_serve'],
        summary: 'Solid from the back.',
        // Present on the real row but must never appear in the DTO:
        transcript: 'Sensitive stuff I said out loud in the car.',
        transcript_raw: 'raw whisper output',
        audio_ref: 'player-1/note-1.webm',
        mood: 'confident',
      },
    ];
    fake.tables.patterns = [];

    const data = await new SupabaseSharingDb(asDb(fake)).getCoachData('player-1');

    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('Sensitive stuff');
    expect(serialized).not.toContain('raw whisper output');
    expect(serialized).not.toContain('audio_ref');
    expect(serialized).not.toContain('confident');
    expect(data.matches).toEqual([
      {
        recordedAt: '2026-09-20T10:00:00Z',
        result: 'W 6-4 6-3',
        opponent: 'Kovalenko',
        tags: ['second_serve'],
        summary: 'Solid from the back.',
      },
    ]);
  });

  it('excludes a match note with coach_share false', async () => {
    const fake = new FakeDb();
    fake.tables.players = [{ id: 'player-1', name: 'Arya Dubey' }];
    fake.tables.notes = [
      {
        id: 'note-1',
        player_id: 'player-1',
        ctx: 'match',
        coach_share: false,
        recorded_at: '2026-09-20T10:00:00Z',
      },
    ];
    fake.tables.patterns = [];

    const data = await new SupabaseSharingDb(asDb(fake)).getCoachData('player-1');

    expect(data.matches).toEqual([]);
  });

  it('excludes a dismissed pattern', async () => {
    const fake = new FakeDb();
    fake.tables.players = [{ id: 'player-1', name: 'Arya Dubey' }];
    fake.tables.notes = [];
    fake.tables.patterns = [
      {
        id: 'pattern-1',
        player_id: 'player-1',
        dismissed: true,
        coach_share: true,
        statement: 'Skips first serve targets after a tiebreak loss',
        kind: 'mental',
        confidence: 'strong',
      },
    ];

    const data = await new SupabaseSharingDb(asDb(fake)).getCoachData('player-1');

    expect(data.patterns).toEqual([]);
  });
});

describe('SupabaseSharingDb.getManagerData', () => {
  it('never mentions notes or agent-draft fields', async () => {
    const fake = new FakeDb();
    fake.tables.players = [{ id: 'player-1', name: 'Arya Dubey', home_currency: 'AUD' }];
    fake.tables.ledger_lines = [];
    fake.tables.reserve_entries = [];
    fake.tables.fx_rates_daily = [];

    const data = await new SupabaseSharingDb(asDb(fake)).getManagerData('player-1');

    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('transcript');
    expect(serialized).not.toContain('note');
    expect(data.scope).toBe('manager');
    expect(data.patronsAvailable).toBe(false);
    // Regression: computeRunwayWeeks returns Infinity for a zero net burn,
    // and JSON.stringify silently turns Infinity into null — found live,
    // this session, as a crash in the coach/[token] page (data.runwayWeeks
    // .toFixed on null). This must come back as an explicit null, never
    // Infinity (which JSON.parse could never reconstruct anyway).
    expect(data.runwayWeeks).toBeNull();
    expect(JSON.parse(serialized).runwayWeeks).toBeNull();
  });
});
