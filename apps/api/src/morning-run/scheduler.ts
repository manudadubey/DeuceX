import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { AGENT_NAMES, type AgentName } from '@deucex/shared';
import type { PgBoss } from 'pg-boss';
import { enqueueAgentRun } from '@deucex/actions/queue';
import {
  DEFAULT_DELIVERY_HOUR,
  listSchedulablePlayers as listMindsetEligible,
  localDateString,
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
//
// Catch-up (28 September 2026): the tick used to fire only in the 07:00 hour,
// so if apps/api wasn't running then (a restart, an outage, or today's local-
// only setup) the player simply got nothing that day, and the Mindset Coach
// had never once run in production. Every tick from 07:00 to 20:59 local now
// enqueues any daily agent that hasn't run for that player today, and a tick
// fires as soon as the worker starts. 07:00 is still when it normally runs.

export const MORNING_RUN_QUEUE = 'morning-run';
export const MORNING_HOUR = DEFAULT_DELIVERY_HOUR;
/** After this local hour a missed morning isn't made up (a "this morning" insight at night is stale). */
export const CATCH_UP_UNTIL_HOUR = 21;

function localHour(now: Date, timezone: string): number {
  return (
    Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      }).format(now),
    ) % 24
  );
}

/** Players whose local time is inside the morning window (07:00 to 20:59). */
export function playersInMorningWindow<T extends MorningPlayer>(
  players: readonly T[],
  now: Date,
): T[] {
  return players.filter((p) => {
    const hour = localHour(now, p.timezone);
    return hour >= MORNING_HOUR && hour < CATCH_UP_UNTIL_HOUR;
  });
}

/** The instant the player's local day began, near enough for "has it run today". */
export function localDayStart(now: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((x) => x.type === type)?.value ?? 0) % 24;
  const elapsed = (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000;
  return new Date(now.getTime() - elapsed - (now.getTime() % 1000));
}

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
  /** `${agentName}:${playerId}` pairs that already ran today (their local day). */
  ranToday: ReadonlySet<string> = new Set(),
): MorningJob[] {
  const jobs: MorningJob[] = [];
  for (const player of playersInMorningWindow(players, now)) {
    const scheduledWindow = localDateString(now, player.timezone);
    const agents: AgentName[] = [AGENT_NAMES.financial];
    if (mindsetEligible.has(player.id)) agents.push(AGENT_NAMES.mindsetCoach);
    for (const agentName of agents) {
      if (ranToday.has(`${agentName}:${player.id}`)) continue;
      jobs.push({ agentName, playerId: player.id, scheduledWindow });
    }
  }
  return jobs;
}

// What already ran today, per player's own day: any agent_runs row since
// their local midnight, plus today's insight row for the Mindset Coach (a
// paused or unchanged-input run writes no agent_runs row). Without this an
// hourly catch-up could regenerate, and overwrite, today's insight.
async function listRanToday(
  db: SupabaseClient<Database>,
  players: readonly MorningPlayer[],
  now: Date,
): Promise<Set<string>> {
  const ran = new Set<string>();
  if (players.length === 0) return ran;
  const ids = players.map((p) => p.id);
  const earliest = new Date(
    Math.min(...players.map((p) => localDayStart(now, p.timezone).getTime())),
  ).toISOString();
  const [{ data: runs, error }, { data: insights, error: insightsError }] = await Promise.all([
    db
      .from('agent_runs')
      .select('agent_name, player_id, started_at')
      .in('player_id', ids)
      .gte('started_at', earliest),
    db
      .from('insights')
      .select('player_id, date')
      .in('player_id', ids)
      .gte('date', localDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000), 'UTC')),
  ]);
  if (error) throw error;
  if (insightsError) throw insightsError;
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const r of runs ?? []) {
    const player = r.player_id ? byId.get(r.player_id) : undefined;
    if (!player) continue;
    if (new Date(r.started_at) >= localDayStart(now, player.timezone)) {
      ran.add(`${r.agent_name}:${player.id}`);
    }
  }
  for (const i of insights ?? []) {
    const player = byId.get(i.player_id);
    if (player && i.date === localDateString(now, player.timezone)) {
      ran.add(`${AGENT_NAMES.mindsetCoach}:${player.id}`);
    }
  }
  return ran;
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
      const players = playersInMorningWindow(await listPlayers(deps.db), now);
      if (!players.length) return;
      const eligible = new Set((await listMindsetEligible(deps.db)).map((p) => p.id));
      const ranToday = await listRanToday(deps.db, players, now);
      for (const job of planMorningRun(players, eligible, now, ranToday)) {
        await enqueueAgentRun(boss, { ...job, triggerType: 'schedule' });
      }
    } catch (err) {
      logger.error('[morning-run] tick failed:', err);
      throw err;
    }
  });

  // Catch up now rather than at the top of the next hour.
  await boss.send(MORNING_RUN_QUEUE, {});
}
