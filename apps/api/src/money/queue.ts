import { PgBoss } from 'pg-boss';

export const FX_DAILY_FETCH_QUEUE = 'fx-daily-fetch';
export const RESERVE_REMINDER_QUEUE = 'reserve-reminder-scheduler';
// Step 2.3's account-deletion sweep lives on this same boss rather than its
// own instance: SUPABASE_DB_URL is the session pooler (CLAUDE.md's own
// infra note, capped at 15 clients), and each PgBoss instance opens its own
// connection pool — a 4th instance alongside notes/actions/money's own
// (discovered live, this session: EMAXCONNSESSION on startup) tips that cap
// over. The sweep is exactly the same "not a scheduled agent run" category
// this file's own comment already describes, so it belongs here.
export const ACCOUNT_DELETION_SWEEP_QUEUE = 'account-deletion-sweep';
// Step 3.1's own addition to this same boss, for the same connection-budget
// reason: PRD-13 AD-17's "raises an alert when a feed misses its expected
// window" is a plain periodic check (no LLM call, no agent_runs row), not a
// scheduled agent run.
export const FEED_WINDOW_CHECK_QUEUE = 'feed-window-check';

export interface MoneyQueueLogger {
  error(...args: unknown[]): void;
}

// A separate, simple pg-boss instance, same reasoning as notes/queue.ts's
// createNotesBoss: none of these jobs is a scheduled *agent* run (no LLM
// call, no agent_runs row, no player-scoped idempotency key), so forcing
// them through packages/actions' AGENT_RUN_QUEUE would be the wrong
// abstraction. fx-daily-fetch is a shared, not-per-player job (the ECB
// archive); reserve-reminder-scheduler and account-deletion-sweep are
// per-player but plain maintenance (a notification send, an admin-API
// call), not an agent proposal. All three share one boss instance rather
// than each getting its own — see the connection-budget note above.
export async function createMoneyBoss(
  connectionString: string,
  logger: MoneyQueueLogger = console,
): Promise<PgBoss> {
  const boss = new PgBoss(connectionString);
  boss.on('error', (err) => logger.error('[pg-boss:money]', err));
  await boss.start();
  await boss.createQueue(FX_DAILY_FETCH_QUEUE);
  await boss.createQueue(RESERVE_REMINDER_QUEUE);
  await boss.createQueue(ACCOUNT_DELETION_SWEEP_QUEUE);
  await boss.createQueue(FEED_WINDOW_CHECK_QUEUE);
  await boss.schedule(FX_DAILY_FETCH_QUEUE, '0 * * * *', {});
  await boss.schedule(RESERVE_REMINDER_QUEUE, '0 * * * *', {});
  await boss.schedule(ACCOUNT_DELETION_SWEEP_QUEUE, '0 * * * *', {});
  await boss.schedule(FEED_WINDOW_CHECK_QUEUE, '0 * * * *', {});
  return boss;
}
