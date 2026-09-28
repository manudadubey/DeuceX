import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import {
  ApprovalActionMismatchError,
  ApprovalAlreadyConsumedError,
  ApprovalNotFoundError,
  ApprovalPayloadMismatchError,
  EntryDeadlinePassedError,
  EntryNotAvailableError,
  EntryNotEnteredError,
} from '@deucex/actions';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest, UnauthorizedError } from '../auth';
import { acceptTournamentEntry, withdrawTournamentEntry } from './entries';

export interface TournamentRoutesDeps {
  db: SupabaseClient<Database>;
  anonClient: SupabaseClient<Database>;
  /** T-13: queue a manual run for this player now (index.ts wires the agent queue). */
  enqueueRerun?: (playerId: string) => Promise<void>;
  now?: () => Date;
}

/** T-13, T-AC-9: one manual re-run an hour. */
export const RERUN_INTERVAL_MS = 60 * 60 * 1000;

/** Pure: when the next manual re-run is allowed, or null when it is allowed now. */
export function rerunAvailableAt(lastManualRunAt: string | null, now: Date): Date | null {
  if (!lastManualRunAt) return null;
  const next = new Date(new Date(lastManualRunAt).getTime() + RERUN_INTERVAL_MS);
  return next.getTime() > now.getTime() ? next : null;
}

async function requirePlayerId(
  deps: TournamentRoutesDeps,
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

function mapEntryError(err: unknown, reply: FastifyReply): FastifyReply | undefined {
  if (
    err instanceof ApprovalNotFoundError ||
    err instanceof ApprovalActionMismatchError ||
    err instanceof ApprovalPayloadMismatchError
  ) {
    return reply.code(400).send({ error: err.message });
  }
  if (err instanceof ApprovalAlreadyConsumedError) {
    return reply.code(409).send({ error: err.message });
  }
  if (err instanceof EntryNotAvailableError || err instanceof EntryNotEnteredError) {
    return reply.code(404).send({ error: err.message });
  }
  if (err instanceof EntryDeadlinePassedError) {
    return reply.code(422).send({ error: err.message });
  }
  return undefined;
}

// The two Tournament Agent transitions gated the same as a Stripe/Resend/
// ICS call (TECH-ARCHITECTURE.md section 3): Accept entry (entry_confirm)
// and Withdraw (retract). Everything else on the agent page — Skip, Undo,
// reading the shortlist and decisions — is a direct, RLS-scoped client
// Supabase call (packages/db's skipCandidate/undoSkip/listShortlistCandidates),
// same split as the Financial Agent's routes.ts.
export async function registerTournamentRoutes(
  app: FastifyInstance,
  deps: TournamentRoutesDeps,
): Promise<void> {
  // T-13: "Re-run now queues a run... and replaces the list in place when
  // done, preserving the player's decisions." A manual run sends no
  // notification (only the Sunday schedule does).
  app.post('/tournament/rerun', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return reply;
    if (!deps.enqueueRerun) return reply.code(503).send({ error: 'Re-run is not available.' });
    const now = (deps.now ?? (() => new Date()))();
    const { data: last, error } = await deps.db
      .from('agent_runs')
      .select('started_at')
      .eq('player_id', playerId)
      .eq('agent_name', 'tournament')
      .eq('trigger_type', 'manual')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    const availableAt = rerunAvailableAt(last?.started_at ?? null, now);
    if (availableAt) {
      return reply.code(429).send({
        error: 'One re-run an hour.',
        availableAt: availableAt.toISOString(),
      });
    }
    await deps.enqueueRerun(playerId);
    return reply.code(202).send({
      queued: true,
      availableAt: new Date(now.getTime() + RERUN_INTERVAL_MS).toISOString(),
    });
  });

  app.post('/tournament/entries/:id/accept', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const { id } = request.params as { id: string };
    const { approvalId } = request.body as { approvalId?: string };
    if (!approvalId) return reply.code(400).send({ error: 'Missing approvalId' });

    try {
      const result = await acceptTournamentEntry(deps.db, {
        approvalId,
        playerId,
        tournamentId: id,
        device: request.headers['user-agent'] ?? null,
      });
      return reply.send(result);
    } catch (err) {
      const mapped = mapEntryError(err, reply);
      if (mapped) return mapped;
      throw err;
    }
  });

  app.post('/tournament/entries/:id/withdraw', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const { id } = request.params as { id: string };
    const { approvalId } = request.body as { approvalId?: string };
    if (!approvalId) return reply.code(400).send({ error: 'Missing approvalId' });

    try {
      const result = await withdrawTournamentEntry(deps.db, {
        approvalId,
        playerId,
        tournamentId: id,
        device: request.headers['user-agent'] ?? null,
      });
      return reply.send(result);
    } catch (err) {
      const mapped = mapEntryError(err, reply);
      if (mapped) return mapped;
      throw err;
    }
  });
}
