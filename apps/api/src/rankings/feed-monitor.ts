import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { PgBoss } from 'pg-boss';
import { FEED_WINDOW_CHECK_QUEUE } from '../money/queue';

export interface FeedStatusLike {
  feed: string;
  next_expected_at: string;
}

// Pure so it's testable without a clock or a database, the same idiom as
// reserves/scheduler.ts's playersDueThisWeekAtHour.
export function findOverdueFeeds(feeds: readonly FeedStatusLike[], now: Date): FeedStatusLike[] {
  return feeds.filter((f) => new Date(f.next_expected_at).getTime() < now.getTime());
}

const FEED_MISSED_WINDOW_KIND = 'feed_missed_window';

// PRD-13 AD-17: "raises an alert when a feed misses its expected window."
// Idempotent per feed: an existing unacknowledged alert for the same feed
// means no second alert is written on the next hourly tick.
export async function checkFeedWindows(
  db: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<{ overdueCount: number }> {
  const { data: feeds, error } = await db.from('feed_status').select('feed, next_expected_at');
  if (error) throw error;

  const overdue = findOverdueFeeds(feeds ?? [], now);
  for (const feed of overdue) {
    const { data: existing, error: existingError } = await db
      .from('alerts')
      .select('id')
      .eq('kind', FEED_MISSED_WINDOW_KIND)
      .eq('link', `/ingestion#${feed.feed}`)
      .is('acknowledged_at', null)
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) continue;

    const { error: insertError } = await db.from('alerts').insert({
      kind: FEED_MISSED_WINDOW_KIND,
      category: 'act',
      title: `${feed.feed} missed its refresh window`,
      body: `Expected by ${feed.next_expected_at}; no import has landed since.`,
      link: `/ingestion#${feed.feed}`,
      role_owner: 'ops',
    });
    if (insertError) throw insertError;
  }

  return { overdueCount: overdue.length };
}

export interface FeedWindowSchedulerDeps {
  db: SupabaseClient<Database>;
  logger?: { error(...args: unknown[]): void };
  now?: () => Date;
}

export async function registerFeedWindowScheduler(
  boss: PgBoss,
  deps: FeedWindowSchedulerDeps,
): Promise<void> {
  const logger = deps.logger ?? console;

  await boss.work(FEED_WINDOW_CHECK_QUEUE, async () => {
    try {
      const now = (deps.now ?? (() => new Date()))();
      await checkFeedWindows(deps.db, now);
    } catch (err) {
      logger.error('[feed-window-check] tick failed:', err);
      throw err;
    }
  });
}
