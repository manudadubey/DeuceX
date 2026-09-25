import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import {
  AgentValidationError,
  ApprovalActionMismatchError,
  ApprovalAlreadyConsumedError,
  ApprovalNotFoundError,
  ApprovalPayloadMismatchError,
} from '@deucex/actions';
import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest, UnauthorizedError } from '../auth';
import { scanReceipt, type ScanReceiptDeps } from './receipts';
import {
  MissingReceivedDateRateError,
  ReceivableNotFoundOrAlreadyReceivedError,
  receiveReceivable,
} from './receivables';

export interface FinancialRoutesDeps extends ScanReceiptDeps {
  anonClient: SupabaseClient<Database>;
  /** Enqueues an 'event'-triggered financial-agent run (worker.ts's enqueueFinancialRecompute), called after apps/web's own direct expense/balance/receivable write completes. */
  enqueueRecompute: (playerId: string) => Promise<void>;
}

// Generous headroom over a phone camera photo at reasonable compression;
// nowhere near enough to be a real upload-abuse vector (same reasoning as
// notes/routes.ts's own MAX_AUDIO_BYTES).
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

async function requirePlayerId(
  deps: FinancialRoutesDeps,
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

// The one Financial Agent action with a real vendor side effect (an OpenAI
// vision call) — everything else (manual expense entry, balance updates,
// saving a reviewed receipt, budget estimates, snoozes) is a direct client
// Supabase call against RLS, per TECH-ARCHITECTURE.md section 1's split and
// this project's packages/db (ledger.ts, reserves.ts, budgets.ts).
export async function registerFinancialRoutes(
  app: FastifyInstance,
  deps: FinancialRoutesDeps,
): Promise<void> {
  await app.register(multipart, { limits: { fileSize: MAX_RECEIPT_BYTES } });

  app.post('/financial/receipts', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;

    let imageBuffer: Buffer | undefined;
    let contentType = 'image/jpeg';

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        imageBuffer = await part.toBuffer();
        contentType = part.mimetype;
      }
    }

    if (!imageBuffer) return reply.code(400).send({ error: 'Missing receipt image' });

    try {
      const result = await scanReceipt(deps, { playerId, imageBuffer, contentType });
      return reply.send(result);
    } catch (err) {
      // F-12/F description: "If extraction fails... the item opens as a
      // blank form. Type it in or skip it" — a 422 tells the client to fall
      // back to a blank manual-entry form rather than retry the same photo.
      if (err instanceof AgentValidationError) {
        return reply.code(422).send({ error: 'extraction_failed' });
      }
      throw err;
    }
  });

  // F-1: "immediately on every saved expense, every balance update and
  // every receivable marked received" — apps/web calls this right after its
  // own direct, RLS-scoped write (ledger_lines/reserve_entries) succeeds.
  // No vendor call here at all; this only enqueues a job (worker.ts).
  app.post('/financial/recompute', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    await deps.enqueueRecompute(playerId);
    return reply.code(202).send();
  });

  // The one Financial Agent transition gated the same as a Stripe/Resend/
  // ICS call (TECH-ARCHITECTURE.md section 3): apps/web creates the
  // approvals row directly (packages/db's createApproval, RLS-scoped), then
  // calls this with that approvalId. Only the service-role client
  // (deps.db) can actually write prize_receivables.status or a
  // cause=received_prize reserve_entries row — see receivables.ts.
  app.post('/financial/receivables/:id/receive', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const { id } = request.params as { id: string };
    const { approvalId, receivedDate, realisedHomeCurrency } = request.body as {
      approvalId?: string;
      receivedDate?: string;
      realisedHomeCurrency?: string;
    };
    if (!approvalId || !receivedDate || !realisedHomeCurrency) {
      return reply
        .code(400)
        .send({ error: 'Missing approvalId, receivedDate or realisedHomeCurrency' });
    }

    try {
      const result = await receiveReceivable(deps.db, {
        approvalId,
        playerId,
        receivableId: id,
        receivedDate,
        realisedHomeCurrency,
      });
      return reply.send(result);
    } catch (err) {
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
      if (err instanceof ReceivableNotFoundOrAlreadyReceivedError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof MissingReceivedDateRateError) {
        return reply.code(422).send({ error: err.message });
      }
      throw err;
    }
  });
}
