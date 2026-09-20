import { PgBoss } from 'pg-boss';

export const NOTE_TRANSCRIBE_QUEUE = 'note-transcribe';
export const NOTE_AUDIO_LIFECYCLE_QUEUE = 'note-audio-lifecycle';

export interface NoteTranscribeJobData {
  noteId: string;
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
export async function createNotesBoss(connectionString: string): Promise<PgBoss> {
  const boss = new PgBoss(connectionString);
  await boss.start();
  await boss.createQueue(NOTE_TRANSCRIBE_QUEUE);
  await boss.createQueue(NOTE_AUDIO_LIFECYCLE_QUEUE);
  await boss.schedule(NOTE_AUDIO_LIFECYCLE_QUEUE, '0 * * * *', {});
  return boss;
}

export interface NotesWorkerDeps {
  transcribeNote(noteId: string): Promise<void>;
  sweepExpiredAudio(): Promise<void>;
}

export async function registerNotesWorkers(boss: PgBoss, deps: NotesWorkerDeps): Promise<void> {
  await boss.work<NoteTranscribeJobData>(NOTE_TRANSCRIBE_QUEUE, async (jobs) => {
    for (const job of jobs) {
      await deps.transcribeNote(job.data.noteId);
    }
  });

  await boss.work(NOTE_AUDIO_LIFECYCLE_QUEUE, async () => {
    await deps.sweepExpiredAudio();
  });
}

export async function enqueueTranscription(boss: PgBoss, noteId: string): Promise<void> {
  await boss.send(NOTE_TRANSCRIBE_QUEUE, { noteId } satisfies NoteTranscribeJobData);
}
