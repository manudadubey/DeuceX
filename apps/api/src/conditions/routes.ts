import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { AgentRunsDb } from '@deucex/actions';
import type { ProseModelClient } from '@deucex/agents';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest, UnauthorizedError } from '../auth';
import { runConditionsForCandidates } from './run';
import type { WeatherAdapter } from './adapter';

export interface ConditionsRoutesDeps {
  db: SupabaseClient<Database>;
  anonClient: SupabaseClient<Database>;
  agentRuns: AgentRunsDb;
  weatherAdapter: WeatherAdapter;
  proseClient: ProseModelClient;
}

async function requirePlayerId(
  deps: ConditionsRoutesDeps,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | undefined> {
  try {
    return await authenticateRequest(deps.anonClient, request.headers.authorization);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      await reply.code(401).send({ error: err.message });
      return undefined;
    }
    throw err;
  }
}

// CE-15: "saving [the equipment profile] triggers a re-run of every current
// brief." apps/web's Equipment pane writes the profile row itself directly
// (an ordinary RLS-scoped client call, packages/db's upsertEquipmentProfile
// — same split as every other Settings pane), then calls this route to run
// the side effect that needs the server (the weather adapter, the prose
// model call), the same "the DB write and the side effect are two separate
// calls" shape Financial Agent's enqueueRecompute already uses.
export async function registerConditionsRoutes(
  app: FastifyInstance,
  deps: ConditionsRoutesDeps,
): Promise<void> {
  app.post('/conditions/re-run', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;

    const { data: candidates, error: candidatesError } = await deps.db
      .from('shortlist_candidates')
      .select('tournament_id')
      .eq('player_id', playerId)
      .eq('current', true);
    if (candidatesError) throw candidatesError;

    const tournamentIds = (candidates ?? []).map((c) => c.tournament_id);
    if (tournamentIds.length === 0) return reply.send({ refreshed: 0 });

    const { data: tournaments, error: tournamentsError } = await deps.db
      .from('tournaments')
      .select('*')
      .in('id', tournamentIds);
    if (tournamentsError) throw tournamentsError;

    await runConditionsForCandidates(
      {
        db: deps.db,
        agentRuns: deps.agentRuns,
        weatherAdapter: deps.weatherAdapter,
        proseClient: deps.proseClient,
      },
      playerId,
      tournaments ?? [],
    );

    return reply.send({ refreshed: tournaments?.length ?? 0 });
  });
}
