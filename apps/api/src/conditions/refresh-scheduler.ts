import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@procircuit/db';
import type { PgBoss } from 'pg-boss';
import type { AgentRunsDb } from '@procircuit/actions';
import { recordRun } from '@procircuit/actions';
import {
  generateConditionsProse,
  isAirAmber,
  PROSE_MODEL,
  type ProseModelClient,
} from '@procircuit/agents';
import { CONDITIONS_REFRESH_QUEUE } from '../money/queue';
import {
  computeBriefForTournament,
  loadEquipmentProfileInput,
  loadPreviousStampedEvent,
} from './compute';
import { persistConditionsBrief } from './persist';
import { CONDITIONS_AGENT_NAME, CONDITIONS_SCHEMA_VERSION } from './run';
import type { WeatherAdapter } from './adapter';

const TRAVEL_WINDOW_DAYS_BEFORE = 7;

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

interface EnteredEvent {
  playerId: string;
  tournament: Database['public']['Tables']['tournaments']['Row'];
}

// PRD-08 section 7's Refresh rule: "fetched at every shortlist run; daily
// from seven days before the first match day of an Entered event; and once
// more at 18:00 local the day before travel." The day-before-travel moment
// already falls inside that seven-day window (there is no itinerary source
// to know a real, earlier travel date separately — PRD-08 section 12's own
// open question), so a single once-daily tick covering the whole window is
// this step's implementation of both halves of that sentence, not two
// separate mechanisms; see docs/BUILD-LOG.md's step 3.3 entry.
export async function listEnteredEventsInTravelWindow(
  db: SupabaseClient<Database>,
  now: Date,
): Promise<EnteredEvent[]> {
  const { data: decisions, error: decisionsError } = await db
    .from('entry_decisions')
    .select('player_id, tournament_id')
    .eq('status', 'entered');
  if (decisionsError) throw decisionsError;
  if (!decisions || decisions.length === 0) return [];

  const tournamentIds = [...new Set(decisions.map((d) => d.tournament_id))];
  const { data: tournaments, error: tournamentsError } = await db
    .from('tournaments')
    .select('*')
    .in('id', tournamentIds);
  if (tournamentsError) throw tournamentsError;

  const tournamentById = new Map((tournaments ?? []).map((t) => [t.id, t]));
  const today = new Date(now.toISOString().slice(0, 10));

  const events: EnteredEvent[] = [];
  for (const decision of decisions) {
    const tournament = tournamentById.get(decision.tournament_id);
    if (!tournament) continue;
    const start = new Date(tournament.start_date);
    const end = new Date(tournament.end_date);
    const daysUntilStart = daysBetween(today, start);
    const daysPastEnd = daysBetween(end, today);
    if (daysUntilStart <= TRAVEL_WINDOW_DAYS_BEFORE && daysPastEnd <= 0) {
      events.push({ playerId: decision.player_id, tournament });
    }
  }
  return events;
}

// CE-7: "a refresh that flips tension, ballDiff, frames or the amber state
// produces the FYI notification" — nothing else (a temperature range
// shifting inside the same rule outcomes) counts as a change worth telling
// the player about. airAmber isn't its own stored column (temp_max/rh_max
// already determine it, amber.ts's own single source of truth), so it's
// derived from the previous row's own numbers for this comparison.
function recommendationChanged(
  previous: Pick<
    Database['public']['Tables']['conditions_briefs']['Row'],
    'tension' | 'ball_diff' | 'frames' | 'temp_max' | 'rh_max'
  >,
  next: { tension: boolean; ballDiff: boolean; frames: number; airAmber: boolean },
): boolean {
  const previousAirAmber = isAirAmber(previous.temp_max, previous.rh_max);
  return (
    previous.tension !== next.tension ||
    previous.ball_diff !== next.ballDiff ||
    previous.frames !== next.frames ||
    previousAirAmber !== next.airAmber
  );
}

async function sendBriefRefreshedNotification(
  db: SupabaseClient<Database>,
  playerId: string,
  tournamentName: string,
  tournamentId: string,
): Promise<void> {
  const { error } = await db.from('notifications').insert({
    player_id: playerId,
    agent: CONDITIONS_AGENT_NAME,
    category: 'fyi',
    title: `${tournamentName} brief refreshed`,
    body: 'The forecast changed enough to update the brief. Open it to see what.',
    action_href: `/agent/tournament?event=${tournamentId}`,
  });
  if (error) throw error;
}

export interface ConditionsRefreshSchedulerDeps {
  db: SupabaseClient<Database>;
  agentRuns: AgentRunsDb;
  weatherAdapter: WeatherAdapter;
  proseClient: ProseModelClient;
  logger?: { error(...args: unknown[]): void };
  now?: () => Date;
}

// Hourly tick, same idempotent-by-construction shape as fx/scheduler.ts's
// own comment: recomputing an already-current brief is harmless (it just
// rewrites the same values), so firing more than once a day for the same
// event costs a little compute but never double-sends a notification, since
// recommendationChanged compares against whatever is currently stored, not
// against "did we already refresh today."
export async function registerConditionsRefreshScheduler(
  boss: PgBoss,
  deps: ConditionsRefreshSchedulerDeps,
): Promise<void> {
  const logger = deps.logger ?? console;

  await boss.work(CONDITIONS_REFRESH_QUEUE, async () => {
    const now = (deps.now ?? (() => new Date()))();
    const events = await listEnteredEventsInTravelWindow(deps.db, now);

    for (const { playerId, tournament } of events) {
      try {
        const equipment = await loadEquipmentProfileInput(deps.db, playerId);
        const previousEvent = await loadPreviousStampedEvent(deps.db, playerId);
        const computed = await computeBriefForTournament(
          deps.weatherAdapter,
          tournament,
          equipment,
          previousEvent,
          now,
        );

        const { data: existing, error: existingError } = await deps.db
          .from('conditions_briefs')
          .select('tension, ball_diff, frames, temp_max, rh_max, diff, practice')
          .eq('player_id', playerId)
          .eq('tournament_id', tournament.id)
          .maybeSingle();
        if (existingError) throw existingError;

        const changed =
          existing !== null &&
          recommendationChanged(existing, {
            tension: computed.rules.tension,
            ballDiff: computed.rules.ballDiff,
            frames: computed.rules.frames,
            airAmber: computed.rules.airAmber,
          });

        // Not changed: keep the existing prose (a fresh forecast that lands
        // on the same recommendation shouldn't spend another model call or
        // silently blank out the brief's own sentences).
        let diff = existing?.diff ?? '';
        let practice = existing?.practice ?? '';
        if (changed) {
          const { output } = await recordRun(
            deps.agentRuns,
            {
              agentName: CONDITIONS_AGENT_NAME,
              playerId,
              triggerType: 'event',
              inputsHash: `${tournament.id}:${now.toISOString().slice(0, 10)}`,
              model: PROSE_MODEL,
              promptVersion: '1',
              schemaVersion: CONDITIONS_SCHEMA_VERSION,
            },
            async () => {
              const result = await generateConditionsProse(deps.proseClient, [
                {
                  tournamentId: tournament.id,
                  name: tournament.name,
                  city: tournament.city,
                  rules: computed.rules,
                  previousEvent,
                },
              ]);
              return { output: result.output as unknown as Json, usage: result.usage };
            },
          );
          const prose = (output as unknown as { briefs: { diff: string; practice: string }[] })
            .briefs[0];
          diff = prose?.diff ?? '';
          practice = prose?.practice ?? '';
          await sendBriefRefreshedNotification(deps.db, playerId, tournament.name, tournament.id);
        }

        await persistConditionsBrief(deps.db, {
          playerId,
          tournamentId: tournament.id,
          runId: null,
          rules: computed.rules,
          diff,
          practice,
          equipmentVersion: equipment.version,
          forecastAt: now.toISOString(),
        });
      } catch (err) {
        logger.error(
          `[conditions-refresh] failed for player ${playerId}, tournament ${tournament.id}:`,
          err,
        );
      }
    }
  });
}
