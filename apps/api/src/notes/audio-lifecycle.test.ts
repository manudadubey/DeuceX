import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { FakeDb, makeNote } from '../test-support/fake-db';
import { createMemoryStorageAdapter } from '../storage/memory-adapter';
import { sweepExpiredAudio } from './audio-lifecycle';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

// S-AC-8: "Given a note uploaded 5 Sep 19:15 and never opened again, when 12
// Sep 19:15 passes, then the audio is deleted with cause 'expired'."
describe('sweepExpiredAudio (time-travelled, S-13/S-AC-8)', () => {
  it('deletes audio uploaded exactly 7 days ago or earlier', async () => {
    const storage = createMemoryStorageAdapter();
    await storage.upload({
      key: 'notes/player-1/old',
      body: Buffer.from('old-audio'),
      contentType: 'audio/webm',
    });
    const fake = new FakeDb({
      notes: [
        makeNote({
          id: 'old',
          audio_ref: 'notes/player-1/old',
          audio_uploaded_at: '2026-09-05T19:15:00Z',
        }),
      ],
    });

    const result = await sweepExpiredAudio(
      { db: asDb(fake), storage },
      new Date('2026-09-12T19:15:00Z'),
    );

    expect(result.deletedCount).toBe(1);
    const [note] = fake.tables.notes!;
    expect(note!.audio_ref).toBeNull();
    expect(note!.audio_delete_cause).toBe('expired');
    expect(note!.audio_deleted_at).toBe('2026-09-12T19:15:00.000Z');
    await expect(storage.download('notes/player-1/old')).rejects.toThrow();
  });

  it('leaves audio alone the moment before the 7-day cutoff', async () => {
    const storage = createMemoryStorageAdapter();
    await storage.upload({
      key: 'notes/player-1/young',
      body: Buffer.from('young-audio'),
      contentType: 'audio/webm',
    });
    const fake = new FakeDb({
      notes: [
        makeNote({
          id: 'young',
          audio_ref: 'notes/player-1/young',
          audio_uploaded_at: '2026-09-05T19:15:00Z',
        }),
      ],
    });

    const result = await sweepExpiredAudio(
      { db: asDb(fake), storage },
      new Date('2026-09-12T19:14:59Z'),
    );

    expect(result.deletedCount).toBe(0);
    const [note] = fake.tables.notes!;
    expect(note!.audio_ref).toBe('notes/player-1/young');
    await expect(storage.download('notes/player-1/young')).resolves.toEqual(
      Buffer.from('young-audio'),
    );
  });

  it('skips notes with no audio left to delete', async () => {
    const fake = new FakeDb({
      notes: [
        makeNote({
          id: 'already-gone',
          audio_ref: null,
          audio_uploaded_at: '2026-01-01T00:00:00Z',
        }),
      ],
    });

    const result = await sweepExpiredAudio(
      { db: asDb(fake), storage: createMemoryStorageAdapter() },
      new Date('2026-09-12T19:15:00Z'),
    );

    expect(result.deletedCount).toBe(0);
  });
});
