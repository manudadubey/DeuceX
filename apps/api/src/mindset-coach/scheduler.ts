import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { AGENT_NAMES } from '@deucex/shared';
import { countLifetimeSavedNotes } from './service';

export const MINDSET_AGENT_NAME = AGENT_NAMES.mindsetCoach;

// Onboarding's own copy (PRD-06 section 2): "Starts after your third Match
// Scribe note." A lifetime count, not the 30-day window generate-insight.ts
// checks for its own "check-ins only" fallback — a player who has written
// three notes ever but none recently should still get a run (and get told
// so by the checkinsOnly path), just not a player who has never reached
// three at all.
const ONBOARDING_NOTE_THRESHOLD = 3;

// Step 5.2 (owner decision, 26 September 2026): every daily agent runs in
// one morning batch at 07:00 in the player's own time zone
// (morning-run/scheduler.ts). This supersedes PRD-06 section 3's 06:00.
export const DEFAULT_DELIVERY_HOUR = 7;

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
// 07:00 falls mid-tick is caught within that same hour, never missed.
export function playersDueThisHour(
  players: readonly SchedulablePlayer[],
  now: Date,
  deliveryHour = DEFAULT_DELIVERY_HOUR,
): SchedulablePlayer[] {
  return players.filter((p) => localHour(now, p.timezone) === deliveryHour);
}
