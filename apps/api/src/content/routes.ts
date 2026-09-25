import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import {
  ApprovalActionMismatchError,
  ApprovalAlreadyConsumedError,
  ApprovalNotFoundError,
  ApprovalPayloadMismatchError,
} from '@deucex/actions';
import {
  InvalidSendTimeError,
  NoRecipientsError,
  UpdateNotFoundError,
  UpdateNotPublishableError,
} from '@deucex/actions/content';
import { CHECK_KINDS, REWRITE_VARIANTS, type CheckKind, type RewriteVariant } from '@deucex/agents';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest, UnauthorizedError } from '../auth';
import {
  cancelSchedule,
  ContentPlanError,
  fixCheck,
  InvalidUpdateInputError,
  loadContentPage,
  publishDraft,
  rebuildFromNewNote,
  removeTeaser,
  restoreOriginal,
  rewriteDraft,
  saveDraft,
  sendPreview,
  skipDraft,
  startManualDraft,
  undoSkip,
  UpdateNotFound,
  UpdateStateError,
  type ContentDeps,
  type DraftEdit,
} from './service';

export interface ContentRoutesDeps extends ContentDeps {
  anonClient: SupabaseClient<Database>;
}

async function requirePlayerId(
  deps: ContentRoutesDeps,
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

function mapError(err: unknown, reply: FastifyReply): FastifyReply | undefined {
  if (
    err instanceof ApprovalNotFoundError ||
    err instanceof ApprovalActionMismatchError ||
    err instanceof ApprovalPayloadMismatchError ||
    err instanceof InvalidUpdateInputError ||
    err instanceof InvalidSendTimeError
  ) {
    return reply.code(400).send({ error: err.message });
  }
  if (err instanceof ContentPlanError) return reply.code(403).send({ error: err.message });
  if (err instanceof UpdateNotFound || err instanceof UpdateNotFoundError) {
    return reply.code(404).send({ error: err.message });
  }
  if (
    err instanceof ApprovalAlreadyConsumedError ||
    err instanceof UpdateStateError ||
    err instanceof UpdateNotPublishableError
  ) {
    return reply.code(409).send({ error: err.message });
  }
  if (err instanceof NoRecipientsError) return reply.code(422).send({ error: err.message });
  return undefined;
}

/**
 * PRD-05's player routes, all bearer-token scoped to the signed-in player.
 * The page reads through GET /content/page; every write goes through a POST
 * here, and only /publish can reach a patron (through packages/actions'
 * gated content_publish, with the approval row the web app created first).
 */
export async function registerContentRoutes(
  app: FastifyInstance,
  deps: ContentRoutesDeps,
): Promise<void> {
  function handle(
    run: (
      playerId: string,
      params: Record<string, string>,
      body: Record<string, unknown>,
    ) => Promise<unknown>,
  ) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const playerId = await requirePlayerId(deps, request, reply);
      if (!playerId) return;
      try {
        const result = await run(
          playerId,
          (request.params ?? {}) as Record<string, string>,
          (request.body ?? {}) as Record<string, unknown>,
        );
        return reply.send(result);
      } catch (err) {
        const mapped = mapError(err, reply);
        if (mapped) return mapped;
        throw err;
      }
    };
  }

  app.get(
    '/content/page',
    handle((playerId) => loadContentPage(deps, playerId)),
  );

  app.post(
    '/content/updates',
    handle((playerId) => startManualDraft(deps, playerId)),
  );

  app.post(
    '/content/updates/:id/save',
    handle((playerId, { id }, body) => {
      const edit: DraftEdit = {};
      if (typeof body.subject === 'string') edit.subject = body.subject;
      if (Array.isArray(body.altSubjects)) edit.altSubjects = body.altSubjects.map(String);
      if (typeof body.body === 'string') edit.body = body.body;
      if (typeof body.practiceSection === 'string' || body.practiceSection === null) {
        edit.practiceSection = body.practiceSection as string | null;
      }
      if (Array.isArray(body.tierIds)) edit.tierIds = body.tierIds.map(String);
      if (typeof body.sendAt === 'string' || body.sendAt === null) {
        edit.sendAt = body.sendAt as string | null;
      }
      if (typeof body.teaser === 'boolean') edit.teaser = body.teaser;
      return saveDraft(deps, playerId, id!, edit);
    }),
  );

  app.post(
    '/content/updates/:id/fix',
    handle((playerId, { id }, body) => {
      const kind = body.kind as CheckKind;
      if (!CHECK_KINDS.includes(kind)) throw new InvalidUpdateInputError('Unknown check');
      return fixCheck(deps, playerId, id!, kind);
    }),
  );

  app.post(
    '/content/updates/:id/rewrite',
    handle((playerId, { id }, body) => {
      const variant = body.variant as RewriteVariant;
      if (!REWRITE_VARIANTS.includes(variant)) throw new InvalidUpdateInputError('Unknown rewrite');
      return rewriteDraft(deps, playerId, id!, variant);
    }),
  );

  app.post(
    '/content/updates/:id/restore',
    handle((p, { id }) => restoreOriginal(deps, p, id!)),
  );

  app.post(
    '/content/updates/:id/skip',
    handle((playerId, { id }, body) =>
      skipDraft(deps, playerId, id!, typeof body.reason === 'string' ? body.reason : ''),
    ),
  );

  app.post(
    '/content/updates/:id/undo-skip',
    handle((p, { id }) => undoSkip(deps, p, id!)),
  );

  app.post(
    '/content/updates/:id/publish',
    handle((playerId, { id }, body) => {
      if (typeof body.approvalId !== 'string')
        throw new InvalidUpdateInputError('Missing approvalId');
      return publishDraft(deps, playerId, id!, body.approvalId);
    }),
  );

  app.post(
    '/content/updates/:id/cancel',
    handle((p, { id }) => cancelSchedule(deps, p, id!)),
  );

  app.post(
    '/content/updates/:id/remove-teaser',
    handle((p, { id }) => removeTeaser(deps, p, id!)),
  );

  app.post(
    '/content/updates/:id/preview',
    handle((p, { id }) => sendPreview(deps, p, id!)),
  );

  app.post(
    '/content/updates/:id/rebuild',
    handle((p, { id }) => rebuildFromNewNote(deps, p, id!)),
  );
}
