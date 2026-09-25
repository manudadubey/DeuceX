import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { describe, expect, it } from 'vitest';
import { FakeDb } from '../test-support/fake-db';
import { checkFeedWindows, findOverdueFeeds } from './feed-monitor';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

describe('findOverdueFeeds (pure)', () => {
  it('flags a feed whose next_expected_at has passed', () => {
    const now = new Date('2026-09-30T00:00:00Z');
    const feeds = [
      { feed: 'atp_rankings', next_expected_at: '2026-09-28T00:00:00Z' },
      { feed: 'wta_rankings', next_expected_at: '2026-10-05T00:00:00Z' },
    ];
    expect(findOverdueFeeds(feeds, now)).toEqual([
      { feed: 'atp_rankings', next_expected_at: '2026-09-28T00:00:00Z' },
    ]);
  });

  it('flags nothing when every feed is still within its window', () => {
    const now = new Date('2026-09-20T00:00:00Z');
    const feeds = [{ feed: 'atp_rankings', next_expected_at: '2026-09-28T00:00:00Z' }];
    expect(findOverdueFeeds(feeds, now)).toEqual([]);
  });
});

describe('checkFeedWindows', () => {
  it('raises an alert (PRD-13 AD-17) when a feed misses its window', async () => {
    const fake = new FakeDb();
    fake.tables.feed_status = [{ feed: 'atp_rankings', next_expected_at: '2026-09-01T00:00:00Z' }];
    const db = asDb(fake);

    const result = await checkFeedWindows(db, new Date('2026-09-23T00:00:00Z'));

    expect(result.overdueCount).toBe(1);
    expect(fake.tables.alerts).toHaveLength(1);
    expect(fake.tables.alerts?.[0]).toMatchObject({
      kind: 'feed_missed_window',
      category: 'act',
      link: '/ingestion#atp_rankings',
    });
  });

  it('does not raise a second alert while one is already unacknowledged', async () => {
    const fake = new FakeDb();
    fake.tables.feed_status = [{ feed: 'atp_rankings', next_expected_at: '2026-09-01T00:00:00Z' }];
    const db = asDb(fake);

    await checkFeedWindows(db, new Date('2026-09-23T00:00:00Z'));
    await checkFeedWindows(db, new Date('2026-09-23T01:00:00Z'));

    expect(fake.tables.alerts).toHaveLength(1);
  });

  it('raises nothing when every feed is on time', async () => {
    const fake = new FakeDb();
    fake.tables.feed_status = [{ feed: 'atp_rankings', next_expected_at: '2026-10-01T00:00:00Z' }];
    const db = asDb(fake);

    const result = await checkFeedWindows(db, new Date('2026-09-23T00:00:00Z'));

    expect(result.overdueCount).toBe(0);
    expect(fake.tables.alerts ?? []).toHaveLength(0);
  });
});
