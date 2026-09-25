import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { AGENT_NAMES, type AgentName } from '@deucex/shared';
import type { PgBoss } from 'pg-boss';
import { enqueueAgentRun } from '@deucex/actions/queue';
import {
  DEFAULT_DELIVERY_HOUR,
  listSchedulablePlayers as listMindsetEligible,
  localDateString,
  playersDueThisHour,
} from '../mindset-coach/scheduler';

// The morning run (build plan step 5.2, PRD-00 section 5.6). Owner decision,
// 26 September 2026: one batch per player at 07:00 in the player's own time
// zone runs every daily agent, replacing the Financial Agent's 07:00 UTC tick
// and the Mindset Coach's 06:00 local one. Each job goes onto the shared
// AGENT_RUN_QUEUE, so the dispatcher's pause and provider checks, the
// 5/20/60 minute retries and the "This morning's run didn't complete" notice
// after the third failure (agent-controls.ts) apply to every agent alike.
//
// The window is the player's local date, so a second tick in the same hour,
// or a restart, is a no-op through the queue's idempotency key.

export const MORNING_RUN_QUEUE = 'morning-run';
export const MORNING_HOUR = DEFAULT_DELIVERY_HOUR;

/** The schedulers this replaces; unscheduled on start so no orphan ticks fire. */
const RETIRED_SCHEDULES = ['financial-scheduler', 'mindset-coach-scheduler'] as const;

export interface MorningJob {
  agentName: AgentName;
  playerId: string;
  scheduledWindow: string;
}

export interface MorningPlayer {
  id: string;
  timezone: string;
}

/**
 * Pure: which daily agents run for which players at this instant. Every
 * player due this hour gets the Financial Agent; the Mindset Coach only once
 * they have three saved notes (PRD-06 section 2, "starts after your third
 * Match Scribe note").
 */
export function planMorningRun(
  players: readonly MorningPlayer[],
  mindsetEligible: ReadonlySet<string>,
  now: Date,
): MorningJob[] {
  const jobs: MorningJob[] = [];
  for (const player of playersDueThisHour(players, now, MORNING_HOUR)) {
    const scheduledWindow = localDateString(now, player.timezone);
    jobs.push({ agentName: AGENT_NAMES.financial, playerId: player.id, scheduledWindow });
    if (mindsetEligible.has(player.id)) {
      jobs.push({ agentName: AGENT_NAMES.mindsetCoach, playerId: player.id, scheduledWindow });
    }
  }
  return jobs;
}

async function listPlayers(db: SupabaseClient<Database>): Promise<MorningPlayer[]> {
  const { data, error } = await db.from('players').select('id, timezone');
  if (error) throw error;
  return data ?? [];
}

export interface MorningRunLogger {
  error(...args: unknown[]): void;
}

export async function registerMorningRun(
  boss: PgBoss,
  deps: { db: SupabaseClient<Database>; logger?: MorningRunLogger; now?: () => Date },
): Promise<void> {
  const logger = deps.logger ?? console;
  for (const name of RETIRED_SCHEDULES) {
    await boss.unschedule(name).catch(() => undefined);
  }
  await boss.createQueue(MORNING_RUN_QUEUE);
  await boss.schedule(MORNING_RUN_QUEUE, '0 * * * *', {});

  await boss.work(MORNING_RUN_QUEUE, async () => {
    try {
      const now = (deps.now ?? (() => new Date()))();
      const players = await listPlayers(deps.db);
      if (!playersDueThisHour(players, now, MORNING_HOUR).length) return;
      const eligible = new Set((await listMindsetEligible(deps.db)).map((p) => p.id));
      for (const job of planMorningRun(players, eligible, now)) {
        await enqueueAgentRun(boss, { ...job, triggerType: 'schedule' });
      }
    } catch (err) {
      logger.error('[morning-run] tick failed:', err);
      throw err;
    }
  });
}
