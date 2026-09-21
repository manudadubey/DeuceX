import { PgBoss } from 'pg-boss';

export const NOTE_TRANSCRIBE_QUEUE = 'note-transcribe';
export const NOTE_EXTRACT_QUEUE = 'note-extract';
export const NOTE_AUDIO_LIFECYCLE_QUEUE = 'note-audio-lifecycle';

export interface NoteTranscribeJobData {
  noteId: string;
}

// A separate job from note-transcribe (step 1.2): retrying a note stuck in
// `failed_extraction` (S-19) only needs to re-run the extractor against the
// transcript that is already durable, never re-download or re-transcribe
// audio — routing it through note-transcribe's job would waste a Whisper
// call and re-run transcription for no reason.
export interface NoteExtractJobData {
  noteId: string;
}

// Minimal logging surface so a test can inject a spy instead of asserting
// against real console output. Defaults to `console` in production.
export interface NotesQueueLogger {
  error(...args: unknown[]): void;
}

// A separate, much simpler pg-boss instance from packages/actions'
// createBoss(): that one is purpose-built for the scheduled-agent-run shape
// (agentName/playerId/scheduledWindow, the pause/provider-switch pickup
// guard, the 5/20/60 minute retry schedule from TECH-ARCHITECTURE.md
// section 3). Match Scribe transcription is player-triggered, not
// scheduled, and isn't gated by agent_schedules — forcing it through that
// queue's AgentJobData shape would just be the wrong abstraction. Hourly is
// generous slack for the lifecycle sweep: Save deletes audio synchronously,
// so this only ever catches the 7-day backstop case (S-13).
export async function createNotesBoss(
  connectionString: string,
  logger: NotesQueueLogger = console,
): Promise<PgBoss> {
  const boss = new PgBoss(connectionString);
  // pg-boss is an EventEmitter; an 'error' event with no listener (its own
  // maintenance/monitoring failures, not a job's own throw — those are
  // handled below) crashes the Node process instead of just failing quietly.
  boss.on('error', (err) => logger.error('[pg-boss]', err));
  await boss.start();
  await boss.createQueue(NOTE_TRANSCRIBE_QUEUE);
  await boss.createQueue(NOTE_EXTRACT_QUEUE);
  await boss.createQueue(NOTE_AUDIO_LIFECYCLE_QUEUE);
  await boss.schedule(NOTE_AUDIO_LIFECYCLE_QUEUE, '0 * * * *', {});
  return boss;
}

export interface NotesWorkerDeps {
  transcribeNote(noteId: string): Promise<void>;
  extractNote(noteId: string): Promise<void>;
  sweepExpiredAudio(): Promise<void>;
  logger?: NotesQueueLogger;
}

// A job that throws (a vendor call failing, a bad db write) was previously
// silent: pg-boss marks the job failed in its own tables, but nothing
// printed why, which is exactly what made a real "insufficient_quota" error
// from Whisper invisible until reproduced by hand outside the app. Every
// failure here is now logged with the note id before being rethrown, so
// pg-boss's own failure bookkeeping (retry, or mark permanently failed)
// still happens unchanged.
export async function registerNotesWorkers(boss: PgBoss, deps: NotesWorkerDeps): Promise<void> {
  const logger = deps.logger ?? console;

  await boss.work<NoteTranscribeJobData>(NOTE_TRANSCRIBE_QUEUE, async (jobs) => {
    for (const job of jobs) {
      try {
        await deps.transcribeNote(job.data.noteId);
      } catch (err) {
        logger.error(`[note-transcribe] failed for note ${job.data.noteId}:`, err);
        throw err;
      }
    }
  });

  // extractNote (extraction.ts's runExtraction) never throws on its own
  // failure path — see its comment — so there is nothing for this wrapper
  // to catch in practice; it is here for the same reason note-transcribe's
  // wrapper is, in case a future change to extractNote starts throwing.
  await boss.work<NoteExtractJobData>(NOTE_EXTRACT_QUEUE, async (jobs) => {
    for (const job of jobs) {
      try {
        await deps.extractNote(job.data.noteId);
      } catch (err) {
        logger.error(`[note-extract] job failed for note ${job.data.noteId}:`, err);
        throw err;
      }
    }
  });

  await boss.work(NOTE_AUDIO_LIFECYCLE_QUEUE, async () => {
    try {
      await deps.sweepExpiredAudio();
    } catch (err) {
      logger.error('[note-audio-lifecycle] sweep failed:', err);
      throw err;
    }
  });
}

export async function enqueueTranscription(boss: PgBoss, noteId: string): Promise<void> {
  await boss.send(NOTE_TRANSCRIBE_QUEUE, { noteId } satisfies NoteTranscribeJobData);
}

export async function enqueueExtraction(boss: PgBoss, noteId: string): Promise<void> {
  await boss.send(NOTE_EXTRACT_QUEUE, { noteId } satisfies NoteExtractJobData);
}
