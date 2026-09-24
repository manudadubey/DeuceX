import type { PgBoss } from 'pg-boss';
import { FANS_ATTENTION_QUEUE } from '../money/queue';
import { runAttentionPassTick, type FansReadDeps } from './service';

// PRD-04 P-9: "the daily pass recomputes it at 06:00 local." Ticks hourly on
// the shared money boss and runs only for players whose local hour is 06,
// the same hourly-tick-then-filter shape as the reserve reminder.
export async function registerFansAttentionScheduler(
  boss: PgBoss,
  deps: FansReadDeps & { logger?: { error(...args: unknown[]): void } },
): Promise<void> {
  const logger = deps.logger ?? console;
  await boss.work(FANS_ATTENTION_QUEUE, async () => {
    try {
      await runAttentionPassTick(deps);
    } catch (err) {
      logger.error('[fans-attention-pass] tick failed:', err);
      throw err;
    }
  });
}
