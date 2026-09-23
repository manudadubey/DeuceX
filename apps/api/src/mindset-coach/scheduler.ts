import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { PgBoss } from 'pg-boss';
import { enqueueAgentRun } from '@procircuit/actions/queue';
import { countLifetimeSavedNotes } from './service';

export const MINDSET_SCHEDULER_QUEUE = 'mindset-coach-scheduler';
export const MINDSET_AGENT_NAME = 'mindset-coach';

// Onboarding's own copy (PRD-06 section 2): "Starts after your third Match
// Scribe note." A lifetime count, not the 30-day window generate-insight.ts
// checks for its own "check-ins only" fallback — a player who has written
// three notes ever but none recently should still get a run (and get told
// so by the checkinsOnly path), just not a player who has never reached
// three at all.
const ONBOARDING_NOTE_THRESHOLD = 3;

// Section 3: "Scheduled daily at 06:00 in the player's time zone (Settings >
// Agents offers 06:00, 07:00 or Evenings 21:00...)." That setting doesn't
// exist yet (PRD-12, step 2.3), so every player currently gets the one
// default hour; a later `mindset_boundaries.delivery_hour`-style column is
// additive once the setting is real.
export const DEFAULT_DELIVERY_HOUR = 6;

export interface SchedulablePlayer {
  id: string;
  timezone: string;
}

export async function listSchedulablePlayers(
  db: SupabaseClient<Database>,
): Promise<SchedulablePlayer[]> {
  const { data, error } = await db.from('players').select('id, timezone');
  if (error) throw error;

  const eligible: SchedulablePlayer[] = [];
  // One count query per player rather than a single grouped query: simplest
  // correct thing at today's player volume (Release 1 hasn't launched), not
  // a query pattern to keep once real volume makes it worth a proper
  // aggregate.
  for (const player of data ?? []) {
    const savedNotes = await countLifetimeSavedNotes(db, player.id);
    if (savedNotes >= ONBOARDING_NOTE_THRESHOLD) {
      eligible.push({ id: player.id, timezone: player.timezone });
    }
  }
  return eligible;
}

function localHour(now: Date, timezone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(
      now,
    ),
  );
}

export function localDateString(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
}

// Pure so it's testable without a clock or a database: given the roster and
// the instant an hourly tick fires, which players' local time is inside the
// delivery hour right now. Firing once an hour means a player whose local
// 06:00 falls mid-tick is caught within that same hour, never missed.
export function playersDueThisHour(
  players: readonly SchedulablePlayer[],
  now: Date,
  deliveryHour = DEFAULT_DELIVERY_HOUR,
): SchedulablePlayer[] {
  return players.filter((p) => localHour(now, p.timezone) === deliveryHour);
}

export interface MindsetSchedulerLogger {
  error(...args: unknown[]): void;
}

// Wires the hourly tick (TECH-ARCHITECTURE.md section 3: "a scheduler...
// enqueues one job per due agent per player") onto the same AGENT_RUN_QUEUE
// pg-boss instance packages/actions' createBoss/registerAgentWorker already
// manage — mindset-coach is the first agent to actually run on that
// infrastructure. scheduledWindow is the player's own local date, so a
// second tick inside the same delivery hour (or a manual re-trigger) is a
// no-op via the idempotency key (packages/actions/src/queue/idempotency-key.ts),
// not a duplicate run.
export async function registerMindsetScheduler(
  boss: PgBoss,
  deps: { db: SupabaseClient<Database>; logger?: MindsetSchedulerLogger; now?: () => Date },
): Promise<void> {
  const logger = deps.logger ?? console;
  await boss.createQueue(MINDSET_SCHEDULER_QUEUE);
  await boss.schedule(MINDSET_SCHEDULER_QUEUE, '0 * * * *', {});

  await boss.work(MINDSET_SCHEDULER_QUEUE, async () => {
    try {
      const now = (deps.now ?? (() => new Date()))();
      const players = await listSchedulablePlayers(deps.db);
      const due = playersDueThisHour(players, now);
      for (const player of due) {
        await enqueueAgentRun(boss, {
          agentName: MINDSET_AGENT_NAME,
          playerId: player.id,
          scheduledWindow: localDateString(now, player.timezone),
          triggerType: 'schedule',
        });
      }
    } catch (err) {
      logger.error('[mindset-coach-scheduler] tick failed:', err);
      throw err;
    }
  });
}
