import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { PgBoss } from 'pg-boss';
import { FX_DAILY_FETCH_QUEUE } from '../money/queue';
import { fetchAndStoreDailyRates } from './service';
import type { EcbRateAdapter } from './adapter';

export interface FxSchedulerDeps {
  db: SupabaseClient<Database>;
  adapter: EcbRateAdapter;
  logger?: { error(...args: unknown[]): void };
  now?: () => Date;
}

// Hourly tick, same shape as notes/queue.ts's note-audio-lifecycle sweep:
// fetchAndStoreDailyRates is idempotent (service.ts), so firing every hour
// both keeps a fresh provisional rate available all day and catches the
// moment ECB actually publishes, without any special-cased "publish time"
// scheduling.
export async function registerFxScheduler(boss: PgBoss, deps: FxSchedulerDeps): Promise<void> {
  const logger = deps.logger ?? console;

  await boss.work(FX_DAILY_FETCH_QUEUE, async () => {
    try {
      const now = (deps.now ?? (() => new Date()))();
      await fetchAndStoreDailyRates(deps.db, deps.adapter, { now, logger });
    } catch (err) {
      logger.error('[fx-daily-fetch] tick failed:', err);
      throw err;
    }
  });
}
