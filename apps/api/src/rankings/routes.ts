import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest, UnauthorizedError } from '../auth';
import type { RankingLookupAdapter, RankingLookupInput } from './adapter';

export interface RankingsRoutesDeps {
  anonClient: SupabaseClient<Database>;
  ranking: RankingLookupAdapter;
}

async function requirePlayerId(
  deps: RankingsRoutesDeps,
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

// OB-3/OB-4: the one call with a real (eventual) vendor side effect in
// onboarding step 1 — everything else onboarding does is the single
// finishOnboarding insert in packages/db/src/players.ts, a direct RLS-scoped
// client call. This route exists purely so the auth-required, service-
// independent shape is in place before step 3.1 gives `ranking` a real feed
// to call (TECH-ARCHITECTURE.md section 1's split).
export async function registerRankingsRoutes(
  app: FastifyInstance,
  deps: RankingsRoutesDeps,
): Promise<void> {
  app.post('/rankings/lookup', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;

    const body = request.body as Partial<RankingLookupInput> | undefined;
    if (!body || (body.tour !== 'atp' && body.tour !== 'wta')) {
      return reply.code(400).send({ error: 'Invalid tour' });
    }
    if (!body.name || !body.country) {
      return reply.code(400).send({ error: 'Missing name or country' });
    }
    if (!body.tourPlayerId && !body.itfId) {
      return reply.code(400).send({ error: 'At least one of tourPlayerId or itfId is required' });
    }

    const result = await deps.ranking.lookup({
      tour: body.tour,
      tourPlayerId: body.tourPlayerId ?? null,
      itfId: body.itfId ?? null,
      name: body.name,
      country: body.country,
    });
    return reply.send({ result });
  });
}
