import type { PgBoss } from 'pg-boss';
import { FANS_ATTENTION_QUEUE } from '../money/queue';
import {
  runAttentionPassTick,
  runPausedExpirySweep,
  type FansReadDeps,
  type PausedExpiryDeps,
} from './service';

// PRD-04 P-9: "the daily pass recomputes it at 06:00 local." Ticks hourly on
// the shared money boss and runs only for players whose local hour is 06,
// the same hourly-tick-then-filter shape as the reserve reminder. Step 4.1b
// adds the 90-day paused-membership sweep to the same tick when Stripe is
// configured (it's idempotent, so running hourly only means a due
// membership ends within the hour).
export async function registerFansAttentionScheduler(
  boss: PgBoss,
  deps: FansReadDeps & {
    expiry: PausedExpiryDeps | null;
    logger?: { error(...args: unknown[]): void };
  },
): Promise<void> {
  const logger = deps.logger ?? console;
  await boss.work(FANS_ATTENTION_QUEUE, async () => {
    try {
      await runAttentionPassTick(deps);
      if (deps.expiry) await runPausedExpirySweep(deps.expiry);
    } catch (err) {
      logger.error('[fans-attention-pass] tick failed:', err);
      throw err;
    }
  });
}
