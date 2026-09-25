import { openDB, type IDBPDatabase } from 'idb';
import type { NoteCtx } from '@deucex/db';

// A note recorded with no signal (S-18, M-PLAT-2): stored here until
// connectivity returns, with a visible queue state ("Waiting for signal ·
// N notes") driven by queuedNoteCount(). The 7-day audio clock starts at
// upload (section 7), not at record time, which falls out naturally here
// since nothing is sent to apps/api until drainOfflineQueue succeeds.
export interface QueuedNote {
  localId: string;
  ctx: NoteCtx;
  recordedAt: string;
  durSeconds: number;
  audio: Blob;
  audioContentType: string;
  languagePreference?: string;
  device?: string;
  queuedAt: string;
}

// Pre-rebrand name, kept: renaming it would strand notes already queued on devices.
const DB_NAME = 'procircuit-match-scribe';
const STORE_NAME = 'pending-notes';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'localId' });
      }
    },
  });
  return dbPromise;
}

export async function enqueueOfflineNote(note: QueuedNote): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, note);
}

export async function listQueuedNotes(): Promise<QueuedNote[]> {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

export async function removeQueuedNote(localId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, localId);
}

export async function queuedNoteCount(): Promise<number> {
  const db = await getDb();
  return db.count(STORE_NAME);
}

// Uploads each queued note in turn via the given callback, removing it
// locally on success. Stops at the first failure instead of trying the
// rest — a failure almost always means "still offline," and the next
// `online` event or poll retries the whole remaining queue in order, so
// notes upload oldest-first rather than out of order.
export async function drainOfflineQueue(
  upload: (note: QueuedNote) => Promise<void>,
): Promise<{ uploaded: number; remaining: number }> {
  const notes = await listQueuedNotes();
  let uploaded = 0;
  for (const note of notes) {
    try {
      await upload(note);
      await removeQueuedNote(note.localId);
      uploaded++;
    } catch {
      break;
    }
  }
  return { uploaded, remaining: notes.length - uploaded };
}
