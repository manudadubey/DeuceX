import type { FastifyInstance } from 'fastify';
import { resolveShareLink, type SharingDb } from './service';

export interface SharingRoutesDeps {
  db: SharingDb;
}

// The one fully unauthenticated route in this API besides /health: a coach
// or manager visitor has no Supabase session for a bearer token to prove,
// so the token in the URL is the only credential there is (PRD-12 4.9). No
// detail on *why* a token fails (revoked vs expired vs never existed) is
// ever returned — a generic 404 for all three, so a guesser cannot
// distinguish them.
export async function registerSharingRoutes(
  app: FastifyInstance,
  deps: SharingRoutesDeps,
): Promise<void> {
  app.get('/sharing/:token', async (request, reply) => {
    const { token } = request.params as { token: string };

    const data = await resolveShareLink(deps.db, token);
    if (!data) return reply.code(404).send({ error: 'This link is invalid or has expired' });

    return reply.send(data);
  });
}
