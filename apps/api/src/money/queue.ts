import { PgBoss } from 'pg-boss';

export const FX_DAILY_FETCH_QUEUE = 'fx-daily-fetch';
export const RESERVE_REMINDER_QUEUE = 'reserve-reminder-scheduler';

export interface MoneyQueueLogger {
  error(...args: unknown[]): void;
}

// A separate, simple pg-boss instance, same reasoning as notes/queue.ts's
// createNotesBoss: neither job below is a scheduled *agent* run (no LLM
// call, no agent_runs row, no player-scoped idempotency key), so forcing
// them through packages/actions' AGENT_RUN_QUEUE would be the wrong
// abstraction. fx-daily-fetch is a shared, not-per-player job (the ECB
// archive); reserve-reminder-scheduler is per-player but a plain
// notification send, not an agent proposal. Both are step 2.1's "money"
// infra, so they share one boss instance rather than each getting its own.
export async function createMoneyBoss(
  connectionString: string,
  logger: MoneyQueueLogger = console,
): Promise<PgBoss> {
  const boss = new PgBoss(connectionString);
  boss.on('error', (err) => logger.error('[pg-boss:money]', err));
  await boss.start();
  await boss.createQueue(FX_DAILY_FETCH_QUEUE);
  await boss.createQueue(RESERVE_REMINDER_QUEUE);
  await boss.schedule(FX_DAILY_FETCH_QUEUE, '0 * * * *', {});
  await boss.schedule(RESERVE_REMINDER_QUEUE, '0 * * * *', {});
  return boss;
}
