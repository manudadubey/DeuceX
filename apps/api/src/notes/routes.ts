import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NoteCtx } from '@deucex/db';
import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest, UnauthorizedError } from '../auth';
import {
  InvalidNoteStateError,
  NoteNotFoundError,
  QuotaExceededError,
  createNote,
  deleteNote,
  retryNote,
  saveNote,
  type NotesServiceDeps,
} from './service';
import { deleteAllAudioForPlayer } from './audio-lifecycle';

export interface NotesRoutesDeps extends NotesServiceDeps {
  anonClient: SupabaseClient<Database>;
}

// Generous headroom over 60 seconds of compressed voice (S-2's cap);
// nowhere near enough to be a real upload-abuse vector at these note
// lengths.
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

const VALID_CTX: readonly NoteCtx[] = ['match', 'practice', 'travel', 'other'];

async function requirePlayerId(
  deps: NotesRoutesDeps,
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

function handleServiceError(reply: FastifyReply, err: unknown): FastifyReply | void {
  if (err instanceof QuotaExceededError) return reply.code(402).send({ error: 'quota_exceeded' });
  if (err instanceof NoteNotFoundError) return reply.code(404).send({ error: 'not_found' });
  if (err instanceof InvalidNoteStateError) return reply.code(409).send({ error: err.message });
  throw err;
}

// The only note actions with a real vendor side effect (R2, Whisper) or a
// status transition apps/api owns (TECH-ARCHITECTURE.md section 1's split).
// Everything else — content edits in review, history reads, the quota
// display — is a direct client Supabase call against RLS; see
// packages/db/src/notes.ts.
export async function registerNotesRoutes(
  app: FastifyInstance,
  deps: NotesRoutesDeps,
): Promise<void> {
  await app.register(multipart, { limits: { fileSize: MAX_AUDIO_BYTES } });

  app.post('/notes', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;

    let audio: Buffer | undefined;
    let audioContentType = 'audio/webm';
    const fields: Record<string, string> = {};

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        audio = await part.toBuffer();
        audioContentType = part.mimetype;
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }

    if (!audio) return reply.code(400).send({ error: 'Missing audio file' });
    const ctx = fields.ctx as NoteCtx;
    if (!VALID_CTX.includes(ctx)) return reply.code(400).send({ error: 'Invalid ctx' });

    try {
      const note = await createNote(deps, {
        playerId,
        ctx,
        recordedAt: fields.recordedAt ?? new Date().toISOString(),
        durSeconds: Number(fields.durSeconds ?? 0),
        audio,
        audioContentType,
        ...(fields.languagePreference ? { languagePreference: fields.languagePreference } : {}),
        device: fields.device ?? null,
      });
      return reply.code(201).send({ note });
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });

  app.patch('/notes/:id/save', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const { id } = request.params as { id: string };

    try {
      const note = await saveNote(deps, { noteId: id, playerId });
      return reply.send({ note });
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });

  app.delete('/notes/:id', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const { id } = request.params as { id: string };

    try {
      await deleteNote(deps, { noteId: id, playerId });
      return reply.code(204).send();
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });

  app.post('/notes/:id/retry', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const { id } = request.params as { id: string };

    try {
      await retryNote(deps, { noteId: id, playerId });
      return reply.code(202).send();
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });

  // Data & safety's "Delete all audio now" (PRD-12 ST-18): an immediate,
  // player-triggered deletion distinct from the 7-day sweep
  // (audio-lifecycle.ts's sweepExpiredAudio) — same table, cause
  // 'player_delete' rather than 'expired'.
  app.post('/notes/audio/delete-all', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;

    const result = await deleteAllAudioForPlayer(deps, playerId, new Date());
    return reply.send(result);
  });
}
