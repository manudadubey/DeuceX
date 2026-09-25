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
// Step 3.3's own addition, same connection-budget reason: PRD-08 section 7's
// "Refresh" rule (daily inside an Entered event's travel window) and CE-11's
// "backfilled within 24 hours" sweep are both plain periodic checks over
// existing rows, not a scheduled *agent* run in the AGENT_RUN_QUEUE sense —
// the refresh tick's own occasional prose call still goes through
// packages/actions' recordRun and agent_runs, same as the initial run.
export const CONDITIONS_REFRESH_QUEUE = 'conditions-refresh';
export const CONDITIONS_STAMP_BACKFILL_QUEUE = 'conditions-stamp-backfill';
// Step 4.1's own addition, same connection-budget reason: PRD-04 P-9's daily
// 06:00-local attention pass is deterministic flag arithmetic over existing
// patron rows (no model call; a note is drafted only when the player taps).
export const FANS_ATTENTION_QUEUE = 'fans-attention-pass';
export const CONTENT_TICK_QUEUE = 'content-tick';

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
  // Step 4.1: an explicit pool cap. pg-boss defaults to 10 connections per
  // instance, and three instances (notes, actions, money) against the
  // session pooler's 15-client limit was found live, this session, to hit
  // EMAXCONNSESSION once this boss's seventh queue (fans-attention-pass)
  // added one more concurrent poller. 4 + 3 + 3 leaves headroom for tests
  // and scripts sharing the same pooler.
  const boss = new PgBoss({ connectionString, max: 4 });
  boss.on('error', (err) => logger.error('[pg-boss:money]', err));
  await boss.start();
  await boss.createQueue(FX_DAILY_FETCH_QUEUE);
  await boss.createQueue(RESERVE_REMINDER_QUEUE);
  await boss.createQueue(ACCOUNT_DELETION_SWEEP_QUEUE);
  await boss.createQueue(FEED_WINDOW_CHECK_QUEUE);
  await boss.createQueue(CONDITIONS_REFRESH_QUEUE);
  await boss.createQueue(CONDITIONS_STAMP_BACKFILL_QUEUE);
  await boss.createQueue(FANS_ATTENTION_QUEUE);
  await boss.createQueue(CONTENT_TICK_QUEUE);
  await boss.schedule(FX_DAILY_FETCH_QUEUE, '0 * * * *', {});
  await boss.schedule(RESERVE_REMINDER_QUEUE, '0 * * * *', {});
  await boss.schedule(ACCOUNT_DELETION_SWEEP_QUEUE, '0 * * * *', {});
  await boss.schedule(FEED_WINDOW_CHECK_QUEUE, '0 * * * *', {});
  await boss.schedule(CONDITIONS_REFRESH_QUEUE, '0 * * * *', {});
  await boss.schedule(CONDITIONS_STAMP_BACKFILL_QUEUE, '0 * * * *', {});
  await boss.schedule(FANS_ATTENTION_QUEUE, '0 * * * *', {});
  // Step 4.2: every five minutes, so a 30-minute draft window (PRD-05 C-1)
  // and a 07:00 scheduled send land within five minutes of their time.
  await boss.schedule(CONTENT_TICK_QUEUE, '*/5 * * * *', {});
  return boss;
}
