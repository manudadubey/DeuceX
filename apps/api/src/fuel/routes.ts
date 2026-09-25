import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { AgentValidationError } from '@deucex/actions';
import { UnreadableMenuError } from '@deucex/agents';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { authenticateRequest, UnauthorizedError } from '../auth';
import { scanMenu, type FuelDeps, type MenuPhoto } from './service';

export interface FuelRoutesDeps extends FuelDeps {
  anonClient: SupabaseClient<Database>;
  /** The player's tier, for the Free lock (worksheet 15: no free scans). */
  getTier(playerId: string): Promise<string | null>;
}

// Per page, the receipt route's own ceiling; a scan is at most four pages
// (a hotel menu rarely runs longer, and every page adds to one call's cost).
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 4;

export async function registerFuelRoutes(
  app: FastifyInstance,
  deps: FuelRoutesDeps,
): Promise<void> {
  await app.register(multipart, { limits: { fileSize: MAX_PAGE_BYTES, files: MAX_PAGES } });

  // The only Fuel call with a vendor side effect (the vision model). Logging
  // a pick, un-logging it, the outcome tap and the profile are direct,
  // RLS-scoped writes from apps/web (packages/db's fuel.ts).
  app.post('/fuel/scans', async (request, reply) => {
    let playerId: string;
    try {
      playerId = await authenticateRequest(deps.anonClient, request.headers.authorization);
    } catch (err) {
      if (err instanceof UnauthorizedError) return reply.code(401).send({ error: err.message });
      throw err;
    }

    // FU-18: Free players never upload a photo. The page never offers the
    // camera on Free; this refuses the request too, before reading a byte.
    const tier = await deps.getTier(playerId);
    if (tier !== 'pro' && tier !== 'elite') {
      return reply.code(403).send({ error: 'fuel_requires_pro' });
    }

    const photos: MenuPhoto[] = [];
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        photos.push({ buffer: await part.toBuffer(), contentType: part.mimetype });
      }
    }
    if (photos.length === 0) return reply.code(400).send({ error: 'Missing menu photo' });

    try {
      return reply.send(await scanMenu(deps, playerId, photos));
    } catch (err) {
      // FU-AC-11: back to the scan state with one line, no partial picks.
      if (err instanceof UnreadableMenuError || err instanceof AgentValidationError) {
        return reply.code(422).send({ error: 'unreadable' });
      }
      throw err;
    } finally {
      photos.length = 0;
    }
  });
}
