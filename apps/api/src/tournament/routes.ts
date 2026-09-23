import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import {
  ApprovalActionMismatchError,
  ApprovalAlreadyConsumedError,
  ApprovalNotFoundError,
  ApprovalPayloadMismatchError,
  EntryDeadlinePassedError,
  EntryNotAvailableError,
  EntryNotEnteredError,
} from '@procircuit/actions';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest, UnauthorizedError } from '../auth';
import { acceptTournamentEntry, withdrawTournamentEntry } from './entries';

export interface TournamentRoutesDeps {
  db: SupabaseClient<Database>;
  anonClient: SupabaseClient<Database>;
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
