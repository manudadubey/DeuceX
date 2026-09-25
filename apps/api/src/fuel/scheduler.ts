import type { PgBoss } from 'pg-boss';
import { FUEL_OUTCOME_QUEUE } from '../money/queue';
import { inferMealOutcomes, type FuelDeps } from './service';

// FU-15's inference, hourly on the shared money boss (no new pg-boss
// instance: the session pooler's client cap, money/queue.ts). No model.
export async function registerFuelOutcomeScheduler(
  boss: PgBoss,
  deps: Pick<FuelDeps, 'store' | 'now'> & { logger?: { error(...args: unknown[]): void } },
): Promise<void> {
  const logger = deps.logger ?? console;
  await boss.work(FUEL_OUTCOME_QUEUE, async () => {
    try {
      await inferMealOutcomes(deps);
    } catch (err) {
      logger.error('[fuel-outcome] sweep failed:', err);
      throw err;
    }
  });
}
