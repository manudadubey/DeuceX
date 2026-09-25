import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import {
  ApprovalActionMismatchError,
  ApprovalAlreadyConsumedError,
  ApprovalNotFoundError,
  ApprovalPayloadMismatchError,
} from '@deucex/actions';
import type { EmailClient } from '@deucex/actions/account';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest, UnauthorizedError } from '../auth';
import {
  MissingPlayerEmailError,
  cancelDeletion,
  confirmDeletion,
  requestDeletion,
  requestExport,
} from './service';

export interface AccountRoutesDeps {
  db: SupabaseClient<Database>;
  anonClient: SupabaseClient<Database>;
  email: EmailClient;
  /** e.g. https://app.deucex.ai — where apps/web is actually reachable, so the emailed confirm link resolves. */
  appBaseUrl: string;
}

async function requirePlayerId(
  deps: AccountRoutesDeps,
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

function sendGateError(reply: FastifyReply, err: unknown): boolean {
  if (
    err instanceof ApprovalNotFoundError ||
    err instanceof ApprovalActionMismatchError ||
    err instanceof ApprovalPayloadMismatchError
  ) {
    void reply.code(400).send({ error: err.message });
    return true;
  }
  if (err instanceof ApprovalAlreadyConsumedError) {
    void reply.code(409).send({ error: err.message });
    return true;
  }
  if (err instanceof MissingPlayerEmailError) {
    void reply.code(422).send({ error: err.message });
    return true;
  }
  return false;
}

// Data & safety's two gated actions plus the token-based confirm/cancel
// pair (PRD-12 section 3, ST-17, ST-19). Registered unauthenticated only
// for /account/delete/confirm — the emailed token is the credential there,
// same trust model as Supabase's own token_hash confirm flow
// (apps/web/app/auth/confirm), so there is nothing for a bearer token to
// add.
export async function registerAccountRoutes(
  app: FastifyInstance,
  deps: AccountRoutesDeps,
): Promise<void> {
  app.post('/account/delete/request', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const { approvalId } = request.body as { approvalId?: string };
    if (!approvalId) return reply.code(400).send({ error: 'Missing approvalId' });

    try {
      await requestDeletion(deps.db, deps.email, {
        approvalId,
        playerId,
        appBaseUrl: deps.appBaseUrl,
      });
      return reply.code(202).send();
    } catch (err) {
      if (sendGateError(reply, err)) return;
      throw err;
    }
  });

  app.post('/account/delete/confirm', async (request, reply) => {
    const { token } = request.body as { token?: string };
    if (!token) return reply.code(400).send({ error: 'Missing token' });

    const result = await confirmDeletion(deps.db, token);
    if (!result) return reply.code(404).send({ error: 'That link is invalid or has expired' });
    return reply.send(result);
  });

  app.post('/account/delete/cancel', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    await cancelDeletion(deps.db, playerId);
    return reply.code(204).send();
  });

  app.post('/account/export/request', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const { approvalId } = request.body as { approvalId?: string };
    if (!approvalId) return reply.code(400).send({ error: 'Missing approvalId' });

    try {
      await requestExport(deps.db, deps.email, { approvalId, playerId });
      return reply.code(202).send();
    } catch (err) {
      if (sendGateError(reply, err)) return;
      throw err;
    }
  });
}
