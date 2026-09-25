import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { AgentRunsDb } from '@deucex/actions';
import { createInvalidExtractionClient, createMockExtractionClient } from '@deucex/agents';
import { FakeDb, makeNote } from '../test-support/fake-db';
import { createMemoryStorageAdapter } from '../storage/memory-adapter';
import { createFixtureWeatherAdapter } from '../conditions/fixture-adapter';
import {
  createFailingTranscriptionAdapter,
  createMockTranscriptionAdapter,
} from '../transcription/mock-adapter';
import {
  InvalidNoteStateError,
  NoteNotFoundError,
  QuotaExceededError,
  createNote,
  deleteNote,
  retryNote,
  saveNote,
  transcribeNote,
  type NotesServiceDeps,
} from './service';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

function fakeAgentRunsDb(): AgentRunsDb {
  return { insertAgentRun: async () => undefined };
}

function baseDeps(fake: FakeDb, overrides: Partial<NotesServiceDeps> = {}): NotesServiceDeps {
  return {
    db: asDb(fake),
    storage: createMemoryStorageAdapter(),
    transcription: createMockTranscriptionAdapter(),
    extraction: createMockExtractionClient(),
    agentRuns: fakeAgentRunsDb(),
    // Returns no forecast by default — most of this test file's fixtures
    // have no Entered tournament/equipment profile at all, so a stamp would
    // never attach regardless; individual tests override this when they
    // want to exercise the stamp path.
    weatherAdapter: createFixtureWeatherAdapter(null),
    enqueueTranscription: async () => undefined,
    enqueueExtraction: async () => undefined,
    now: () => new Date('2026-09-11T18:44:00Z'),
    logger: { error: () => undefined },
    ...overrides,
  };
}

describe('createNote', () => {
  it('uploads the audio, inserts a transcribing note and enqueues transcription', async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1', tier: null }] });
    const enqueued: string[] = [];
    const deps = baseDeps(fake, { enqueueTranscription: async (id) => void enqueued.push(id) });

    const note = await createNote(deps, {
      playerId: 'player-1',
      ctx: 'match',
      recordedAt: '2026-09-11T18:42:00Z',
      durSeconds: 52,
      audio: Buffer.from('audio-bytes'),
      audioContentType: 'audio/webm',
    });

    expect(note.status).toBe('transcribing');
    expect(note.audio_ref).toBeTruthy();
    expect(note.audio_uploaded_at).toBe('2026-09-11T18:44:00.000Z');
    expect(enqueued).toEqual([note.id]);
    expect(note.audio_ref).toBeTruthy();
    expect(
      await (deps.storage as ReturnType<typeof createMemoryStorageAdapter>).download(
        note.audio_ref!,
      ),
    ).toEqual(Buffer.from('audio-bytes'));
  });

  it('clamps dur_seconds to the 0-60 range (S-2)', async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1', tier: null }] });
    const deps = baseDeps(fake);

    const note = await createNote(deps, {
      playerId: 'player-1',
      ctx: 'other',
      recordedAt: '2026-09-11T18:42:00Z',
      durSeconds: 75,
      audio: Buffer.from('x'),
      audioContentType: 'audio/webm',
    });

    expect(note.dur_seconds).toBe(60);
  });

  it('records a fixed language preference as lang_source = preference (S-5)', async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1', tier: null }] });
    const deps = baseDeps(fake);

    const note = await createNote(deps, {
      playerId: 'player-1',
      ctx: 'match',
      recordedAt: '2026-09-11T18:42:00Z',
      durSeconds: 30,
      audio: Buffer.from('x'),
      audioContentType: 'audio/webm',
      languagePreference: 'de',
    });

    expect(note.lang).toBe('de');
    expect(note.lang_source).toBe('preference');
  });

  it('treats "auto" as no fixed preference', async () => {
    const fake = new FakeDb({ players: [{ id: 'player-1', tier: null }] });
    const deps = baseDeps(fake);

    const note = await createNote(deps, {
      playerId: 'player-1',
      ctx: 'match',
      recordedAt: '2026-09-11T18:42:00Z',
      durSeconds: 30,
      audio: Buffer.from('x'),
      audioContentType: 'audio/webm',
      languagePreference: 'auto',
    });

    expect(note.lang_source).toBeNull();
  });

  it('refuses a Free player at the 10-note monthly quota (S-16)', async () => {
    const savedThisMonth = Array.from({ length: 10 }, (_, i) =>
      makeNote({ id: `note-${i}`, player_id: 'player-1', status: 'saved' }),
    );
    const fake = new FakeDb({
      players: [{ id: 'player-1', tier: null }],
      notes: savedThisMonth,
    });
    const deps = baseDeps(fake);

    await expect(
      createNote(deps, {
        playerId: 'player-1',
        ctx: 'match',
        recordedAt: '2026-09-11T18:42:00Z',
        durSeconds: 30,
        audio: Buffer.from('x'),
        audioContentType: 'audio/webm',
      }),
    ).rejects.toThrow(QuotaExceededError);
  });

  it('does not quota-limit a Pro player', async () => {
    const savedThisMonth = Array.from({ length: 10 }, (_, i) =>
      makeNote({ id: `note-${i}`, player_id: 'player-1', status: 'saved' }),
    );
    const fake = new FakeDb({
      players: [{ id: 'player-1', tier: 'pro' }],
      notes: savedThisMonth,
    });
    const deps = baseDeps(fake);

    const note = await createNote(deps, {
      playerId: 'player-1',
      ctx: 'match',
      recordedAt: '2026-09-11T18:42:00Z',
      durSeconds: 30,
      audio: Buffer.from('x'),
      audioContentType: 'audio/webm',
    });

    expect(note.status).toBe('transcribing');
  });
});

describe('transcribeNote', () => {
  it('fills the transcript, runs extraction and moves the note to review on success (step 1.2)', async () => {
    const storage = createMemoryStorageAdapter();
    await storage.upload({
      key: 'notes/player-1/note-1',
      body: Buffer.from('audio'),
      contentType: 'audio/webm',
    });
    const fake = new FakeDb({
      notes: [makeNote({ status: 'transcribing', transcript: null })],
    });
    const deps = baseDeps(fake, { storage });

    await transcribeNote(deps, 'note-1');

    const [note] = fake.tables.notes!;
    expect(note!.status).toBe('review');
    expect(note!.transcript).toBeTruthy();
    expect(note!.transcript_raw).toBe(note!.transcript);
    expect(note!.lang).toBe('en');
    expect(note!.result).toBe('L 6-4 3-6 6-7(5)');
    expect(note!.opponent).toBe('Kovalenko');
    expect(note!.mood).toBe('frustrated');
    expect(note!.extraction).toMatchObject({ valid: true });
  });

  it('leaves result/opponent/mood untouched and marks failed_extraction when the model output never validates (S-7, S-19)', async () => {
    const storage = createMemoryStorageAdapter();
    await storage.upload({
      key: 'notes/player-1/note-1',
      body: Buffer.from('audio'),
      contentType: 'audio/webm',
    });
    const fake = new FakeDb({
      notes: [makeNote({ status: 'transcribing', transcript: null })],
    });
    const deps = baseDeps(fake, { storage, extraction: createInvalidExtractionClient() });

    await transcribeNote(deps, 'note-1');

    const [note] = fake.tables.notes!;
    expect(note!.status).toBe('failed_extraction');
    expect(note!.transcript).toBeTruthy();
    expect(note!.result).toBeNull();
    expect(note!.extraction).toMatchObject({ valid: false });
  });

  it('passes the fixed language preference through as an override', async () => {
    const storage = createMemoryStorageAdapter();
    await storage.upload({
      key: 'notes/player-1/note-1',
      body: Buffer.from('audio'),
      contentType: 'audio/webm',
    });
    const fake = new FakeDb({
      notes: [makeNote({ status: 'transcribing', lang: 'de', lang_source: 'preference' })],
    });
    const deps = baseDeps(fake, { storage });

    await transcribeNote(deps, 'note-1');

    expect(fake.tables.notes![0]!.lang).toBe('de');
  });

  it('marks the note failed_transcription and rethrows on failure, leaving audio untouched (S-19)', async () => {
    const storage = createMemoryStorageAdapter();
    await storage.upload({
      key: 'notes/player-1/note-1',
      body: Buffer.from('audio'),
      contentType: 'audio/webm',
    });
    const fake = new FakeDb({ notes: [makeNote({ status: 'transcribing' })] });
    const deps = baseDeps(fake, {
      storage,
      transcription: createFailingTranscriptionAdapter('vendor down'),
    });

    await expect(transcribeNote(deps, 'note-1')).rejects.toThrow('vendor down');

    const [note] = fake.tables.notes!;
    expect(note!.status).toBe('failed_transcription');
    expect(note!.audio_ref).toBe('notes/player-1/note-1');
  });
});

describe('retryNote', () => {
  it('re-enqueues a failed transcription', async () => {
    const fake = new FakeDb({ notes: [makeNote({ status: 'failed_transcription' })] });
    const enqueued: string[] = [];
    const deps = baseDeps(fake, { enqueueTranscription: async (id) => void enqueued.push(id) });

    await retryNote(deps, { noteId: 'note-1', playerId: 'player-1' });

    expect(fake.tables.notes![0]!.status).toBe('transcribing');
    expect(enqueued).toEqual(['note-1']);
  });

  it('re-enqueues extraction alone for failed_extraction, without touching transcription (S-19, step 1.2)', async () => {
    const fake = new FakeDb({ notes: [makeNote({ status: 'failed_extraction' })] });
    const transcriptionEnqueued: string[] = [];
    const extractionEnqueued: string[] = [];
    const deps = baseDeps(fake, {
      enqueueTranscription: async (id) => void transcriptionEnqueued.push(id),
      enqueueExtraction: async (id) => void extractionEnqueued.push(id),
    });

    await retryNote(deps, { noteId: 'note-1', playerId: 'player-1' });

    expect(fake.tables.notes![0]!.status).toBe('transcribing');
    expect(extractionEnqueued).toEqual(['note-1']);
    expect(transcriptionEnqueued).toEqual([]);
  });

  it('refuses to retry a note that has not failed', async () => {
    const fake = new FakeDb({ notes: [makeNote({ status: 'review' })] });
    const deps = baseDeps(fake);

    await expect(retryNote(deps, { noteId: 'note-1', playerId: 'player-1' })).rejects.toThrow(
      InvalidNoteStateError,
    );
  });

  it('refuses a note that does not belong to the caller', async () => {
    const fake = new FakeDb({ notes: [makeNote({ status: 'failed_transcription' })] });
    const deps = baseDeps(fake);

    await expect(retryNote(deps, { noteId: 'note-1', playerId: 'someone-else' })).rejects.toThrow(
      NoteNotFoundError,
    );
  });
});

describe('saveNote', () => {
  it('confirms the transcript and deletes the audio immediately (S-13, S-AC-7)', async () => {
    const storage = createMemoryStorageAdapter();
    await storage.upload({
      key: 'notes/player-1/note-1',
      body: Buffer.from('audio'),
      contentType: 'audio/webm',
    });
    const fake = new FakeDb({
      players: [{ id: 'player-1', tier: null }],
      notes: [makeNote({ status: 'review' })],
    });
    const deps = baseDeps(fake, { storage });

    const saved = await saveNote(deps, { noteId: 'note-1', playerId: 'player-1' });

    expect(saved.status).toBe('saved');
    expect(saved.transcript_confirmed_at).toBe('2026-09-11T18:44:00.000Z');
    expect(saved.audio_ref).toBeNull();
    expect(saved.audio_delete_cause).toBe('confirmed');
    await expect(storage.download('notes/player-1/note-1')).rejects.toThrow();
  });

  it('allows saving a note whose transcription failed once the player has typed it in (S-19)', async () => {
    const fake = new FakeDb({
      players: [{ id: 'player-1', tier: null }],
      notes: [
        makeNote({ status: 'failed_transcription', transcript: 'Typed by hand.', audio_ref: null }),
      ],
    });
    const deps = baseDeps(fake);

    const saved = await saveNote(deps, { noteId: 'note-1', playerId: 'player-1' });

    expect(saved.status).toBe('saved');
  });

  it('refuses to save a note that is not in review', async () => {
    const fake = new FakeDb({
      players: [{ id: 'player-1', tier: null }],
      notes: [makeNote({ status: 'transcribing' })],
    });
    const deps = baseDeps(fake);

    await expect(saveNote(deps, { noteId: 'note-1', playerId: 'player-1' })).rejects.toThrow(
      InvalidNoteStateError,
    );
  });

  it('refuses a Free player saving an 11th note this month (S-16)', async () => {
    const alreadySaved = Array.from({ length: 10 }, (_, i) =>
      makeNote({ id: `saved-${i}`, player_id: 'player-1', status: 'saved' }),
    );
    const fake = new FakeDb({
      players: [{ id: 'player-1', tier: null }],
      notes: [...alreadySaved, makeNote({ id: 'note-11', status: 'review' })],
    });
    const deps = baseDeps(fake);

    await expect(saveNote(deps, { noteId: 'note-11', playerId: 'player-1' })).rejects.toThrow(
      QuotaExceededError,
    );
  });
});

describe('deleteNote', () => {
  it('hard-deletes a note that was never saved, and its audio (Discard)', async () => {
    const storage = createMemoryStorageAdapter();
    await storage.upload({
      key: 'notes/player-1/note-1',
      body: Buffer.from('audio'),
      contentType: 'audio/webm',
    });
    const fake = new FakeDb({ notes: [makeNote({ status: 'review' })] });
    const deps = baseDeps(fake, { storage });

    await deleteNote(deps, { noteId: 'note-1', playerId: 'player-1' });

    expect(fake.tables.notes).toEqual([]);
    await expect(storage.download('notes/player-1/note-1')).rejects.toThrow();
  });

  it('soft-deletes a saved note, clearing content but keeping the row (S-14)', async () => {
    const storage = createMemoryStorageAdapter();
    const fake = new FakeDb({
      notes: [
        makeNote({
          status: 'saved',
          audio_ref: null,
          transcript: 'Lost in a breaker.',
          result: 'L 6-4 3-6 6-7(5)',
        }),
      ],
    });
    const deps = baseDeps(fake, { storage });

    await deleteNote(deps, { noteId: 'note-1', playerId: 'player-1' });

    expect(fake.tables.notes).toHaveLength(1);
    const [note] = fake.tables.notes!;
    expect(note!.status).toBe('deleted');
    expect(note!.deleted_at).toBe('2026-09-11T18:44:00.000Z');
    expect(note!.transcript).toBeNull();
    expect(note!.result).toBeNull();
  });

  it('deletes remaining audio and sets the player_delete cause when a saved note still has audio', async () => {
    const storage = createMemoryStorageAdapter();
    await storage.upload({
      key: 'notes/player-1/note-1',
      body: Buffer.from('audio'),
      contentType: 'audio/webm',
    });
    const fake = new FakeDb({ notes: [makeNote({ status: 'saved' })] });
    const deps = baseDeps(fake, { storage });

    await deleteNote(deps, { noteId: 'note-1', playerId: 'player-1' });

    const [note] = fake.tables.notes!;
    expect(note!.audio_ref).toBeNull();
    expect(note!.audio_delete_cause).toBe('player_delete');
    await expect(storage.download('notes/player-1/note-1')).rejects.toThrow();
  });

  it('throws for a note that does not belong to the caller', async () => {
    const fake = new FakeDb({ notes: [makeNote({ status: 'review' })] });
    const deps = baseDeps(fake);

    await expect(deleteNote(deps, { noteId: 'note-1', playerId: 'someone-else' })).rejects.toThrow(
      NoteNotFoundError,
    );
  });
});
