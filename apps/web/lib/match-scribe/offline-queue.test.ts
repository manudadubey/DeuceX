import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  drainOfflineQueue,
  enqueueOfflineNote,
  listQueuedNotes,
  queuedNoteCount,
  removeQueuedNote,
  type QueuedNote,
} from './offline-queue';

function makeQueuedNote(overrides: Partial<QueuedNote> = {}): QueuedNote {
  return {
    localId: 'local-1',
    ctx: 'match',
    recordedAt: '2026-09-11T18:42:00Z',
    durSeconds: 52,
    audio: new Blob(['audio-bytes'], { type: 'audio/webm' }),
    audioContentType: 'audio/webm',
    queuedAt: '2026-09-11T18:42:05Z',
    ...overrides,
  };
}

beforeEach(async () => {
  // Empties the store via the module's own connection rather than deleting
  // the database, since getDb() caches its connection for the life of the
  // module — deleting out from under it would leave later tests holding a
  // stale handle.
  const notes = await listQueuedNotes();
  await Promise.all(notes.map((note) => removeQueuedNote(note.localId)));
});

describe('offline queue (S-18)', () => {
  it('starts empty', async () => {
    expect(await queuedNoteCount()).toBe(0);
  });

  it('queues a note recorded with no signal and shows it in the count', async () => {
    await enqueueOfflineNote(makeQueuedNote());
    expect(await queuedNoteCount()).toBe(1);
    const notes = await listQueuedNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.ctx).toBe('match');
  });

  it('removes a note once uploaded', async () => {
    await enqueueOfflineNote(makeQueuedNote());
    await removeQueuedNote('local-1');
    expect(await queuedNoteCount()).toBe(0);
  });

  it('drains the queue in order, uploading and removing each note', async () => {
    await enqueueOfflineNote(makeQueuedNote({ localId: 'a', recordedAt: '2026-09-11T18:00:00Z' }));
    await enqueueOfflineNote(makeQueuedNote({ localId: 'b', recordedAt: '2026-09-11T19:00:00Z' }));

    const uploadedIds: string[] = [];
    const upload = vi.fn(async (note: QueuedNote) => {
      uploadedIds.push(note.localId);
    });

    const result = await drainOfflineQueue(upload);

    expect(result).toEqual({ uploaded: 2, remaining: 0 });
    expect(uploadedIds).toEqual(['a', 'b']);
    expect(await queuedNoteCount()).toBe(0);
  });

  it('stops at the first upload failure and leaves the rest queued', async () => {
    await enqueueOfflineNote(makeQueuedNote({ localId: 'a' }));
    await enqueueOfflineNote(makeQueuedNote({ localId: 'b' }));

    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error('still offline'))
      .mockResolvedValueOnce(undefined);

    const result = await drainOfflineQueue(upload);

    expect(result.uploaded).toBe(0);
    expect(await queuedNoteCount()).toBe(2);
  });
});
