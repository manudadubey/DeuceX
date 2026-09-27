import type { PgBoss } from 'pg-boss';
import { BILLING_SWEEP_QUEUE } from '../money/queue';
import { runBillingSweep, type BillingSweepDeps } from './sweep';

// Hourly on the shared money boss (money/queue.ts), like the Fans 90-day sweep.
export async function registerBillingSweepScheduler(
  boss: PgBoss,
  deps: BillingSweepDeps,
): Promise<void> {
  const logger = deps.logger ?? console;
  await boss.work(BILLING_SWEEP_QUEUE, async () => {
    try {
      await runBillingSweep(deps);
    } catch (err) {
      logger.error('[billing-sweep] tick failed:', err);
      throw err;
    }
  });
}
