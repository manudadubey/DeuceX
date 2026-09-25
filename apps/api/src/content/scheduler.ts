import type { PgBoss } from 'pg-boss';
import { CONTENT_TICK_QUEUE } from '../money/queue';
import { runContentTick, type ContentDeps } from './service';

// PRD-05's timed work, on the shared money boss (its pool is capped, so a new
// queue costs no new connections): drafts whose window has passed, scheduled
// updates whose send time has come, and the Resend open poll.
export async function registerContentScheduler(boss: PgBoss, deps: ContentDeps): Promise<void> {
  const logger = deps.logger ?? console;
  await boss.work(CONTENT_TICK_QUEUE, async () => {
    try {
      await runContentTick(deps);
    } catch (err) {
      logger.error('[content-tick] tick failed:', err);
      throw err;
    }
  });
}
