import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import Fastify from 'fastify';
import { FakeDb, makeNote } from '../test-support/fake-db';
import { createMemoryStorageAdapter } from '../storage/memory-adapter';
import { createMockTranscriptionAdapter } from '../transcription/mock-adapter';
import { registerNotesRoutes, type NotesRoutesDeps } from './routes';

function fakeAnonClient(validToken: string, playerId: string): SupabaseClient<Database> {
  return {
    auth: {
      async getUser(token?: string) {
        if (token === validToken) {
          return { data: { user: { id: playerId } }, error: null };
        }
        return { data: { user: null }, error: new Error('invalid token') };
      },
    },
  } as unknown as SupabaseClient<Database>;
}

function buildMultipart(
  fields: Record<string, string>,
  file: { field: string; filename: string; contentType: string; data: Buffer },
): { body: Buffer; contentType: string } {
  const boundary = '----procircuittestboundary';
  const parts: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    ),
  );
  parts.push(file.data);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function buildApp(fake: FakeDb, overrides: Partial<NotesRoutesDeps> = {}) {
  const app = Fastify();
  const deps: NotesRoutesDeps = {
    db: fake as unknown as SupabaseClient<Database>,
    anonClient: fakeAnonClient('good-token', 'player-1'),
    storage: createMemoryStorageAdapter(),
    transcription: createMockTranscriptionAdapter(),
    enqueueTranscription: async () => undefined,
    now: () => new Date('2026-09-11T18:44:00Z'),
    ...overrides,
  };
  await registerNotesRoutes(app, deps);
  await app.ready();
  return app;
}

describe('POST /notes', () => {
  it('refuses a request with no bearer token', async () => {
    const app = await buildApp(new FakeDb({ players: [{ id: 'player-1', tier: null }] }));
    const res = await app.inject({ method: 'POST', url: '/notes' });
    expect(res.statusCode).toBe(401);
  });

  it('uploads audio and creates a transcribing note', async () => {
    const app = await buildApp(new FakeDb({ players: [{ id: 'player-1', tier: null }] }));
    const { body, contentType } = buildMultipart(
      { ctx: 'match', recordedAt: '2026-09-11T18:42:00Z', durSeconds: '52' },
      {
        field: 'audio',
        filename: 'note.webm',
        contentType: 'audio/webm',
        data: Buffer.from('bytes'),
      },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: 'Bearer good-token', 'content-type': contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(201);
    const { note } = res.json();
    expect(note.status).toBe('transcribing');
    expect(note.ctx).toBe('match');
  });

  it('returns 402 quota_exceeded for a Free player at 10 saved notes this month', async () => {
    const alreadySaved = Array.from({ length: 10 }, (_, i) =>
      makeNote({ id: `saved-${i}`, player_id: 'player-1', status: 'saved' }),
    );
    const app = await buildApp(
      new FakeDb({ players: [{ id: 'player-1', tier: null }], notes: alreadySaved }),
    );
    const { body, contentType } = buildMultipart(
      { ctx: 'match', recordedAt: '2026-09-11T18:42:00Z', durSeconds: '30' },
      {
        field: 'audio',
        filename: 'note.webm',
        contentType: 'audio/webm',
        data: Buffer.from('bytes'),
      },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: 'Bearer good-token', 'content-type': contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(402);
    expect(res.json()).toEqual({ error: 'quota_exceeded' });
  });
});

describe('PATCH /notes/:id/save', () => {
  it('saves a note in review and confirms the transcript', async () => {
    const app = await buildApp(
      new FakeDb({
        players: [{ id: 'player-1', tier: null }],
        notes: [makeNote({ status: 'review' })],
      }),
    );

    const res = await app.inject({
      method: 'PATCH',
      url: '/notes/note-1/save',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().note.status).toBe('saved');
  });

  it('returns 409 for a note that is not in review', async () => {
    const app = await buildApp(
      new FakeDb({
        players: [{ id: 'player-1', tier: null }],
        notes: [makeNote({ status: 'transcribing' })],
      }),
    );

    const res = await app.inject({
      method: 'PATCH',
      url: '/notes/note-1/save',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 404 for a note that does not exist', async () => {
    const app = await buildApp(new FakeDb({ players: [{ id: 'player-1', tier: null }] }));

    const res = await app.inject({
      method: 'PATCH',
      url: '/notes/does-not-exist/save',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /notes/:id', () => {
  it('removes a note that was never saved (Discard)', async () => {
    const fake = new FakeDb({ notes: [makeNote({ status: 'review' })] });
    const app = await buildApp(fake);

    const res = await app.inject({
      method: 'DELETE',
      url: '/notes/note-1',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(res.statusCode).toBe(204);
    expect(fake.tables.notes).toEqual([]);
  });
});

describe('POST /notes/:id/retry', () => {
  it('re-enqueues a failed transcription', async () => {
    const fake = new FakeDb({ notes: [makeNote({ status: 'failed_transcription' })] });
    const app = await buildApp(fake);

    const res = await app.inject({
      method: 'POST',
      url: '/notes/note-1/retry',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(res.statusCode).toBe(202);
    expect(fake.tables.notes![0]!.status).toBe('transcribing');
  });

  it('returns 409 retrying a note that has not failed', async () => {
    const fake = new FakeDb({ notes: [makeNote({ status: 'review' })] });
    const app = await buildApp(fake);

    const res = await app.inject({
      method: 'POST',
      url: '/notes/note-1/retry',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(res.statusCode).toBe(409);
  });
});
