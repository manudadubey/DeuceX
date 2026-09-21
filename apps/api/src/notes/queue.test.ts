import { describe, expect, it, vi } from 'vitest';
import type { PgBoss } from 'pg-boss';
import {
  NOTE_AUDIO_LIFECYCLE_QUEUE,
  NOTE_EXTRACT_QUEUE,
  NOTE_TRANSCRIBE_QUEUE,
  registerNotesWorkers,
} from './queue';

// A minimal fake of the one pg-boss method registerNotesWorkers calls
// (.work(queueName, handler)), capturing each handler so the test can
// invoke it directly — proving the logging wrapper around a job that
// throws, not pg-boss's own scheduling (that needs a live Postgres
// connection and isn't what changed here).
function fakeBoss() {
  const handlers = new Map<string, (jobs: unknown[]) => Promise<void>>();
  const work = vi.fn(async (queueName: string, handler: (jobs: unknown[]) => Promise<void>) => {
    handlers.set(queueName, handler);
    return 'sub-id';
  });
  return { boss: { work } as unknown as PgBoss, handlers };
}

function baseDeps(overrides: Partial<Parameters<typeof registerNotesWorkers>[1]> = {}) {
  return {
    transcribeNote: vi.fn(),
    extractNote: vi.fn(),
    sweepExpiredAudio: vi.fn(),
    ...overrides,
  };
}

describe('registerNotesWorkers', () => {
  it('logs the note id and rethrows when transcribeNote fails', async () => {
    const { boss, handlers } = fakeBoss();
    const error = new Error('insufficient_quota');
    const logger = { error: vi.fn() };

    await registerNotesWorkers(
      boss,
      baseDeps({ transcribeNote: vi.fn().mockRejectedValue(error), logger }),
    );

    const transcribeHandler = handlers.get(NOTE_TRANSCRIBE_QUEUE)!;
    await expect(transcribeHandler([{ data: { noteId: 'note-1' } }])).rejects.toThrow(
      'insufficient_quota',
    );

    expect(logger.error).toHaveBeenCalledWith('[note-transcribe] failed for note note-1:', error);
  });

  it('does not log when transcribeNote succeeds', async () => {
    const { boss, handlers } = fakeBoss();
    const logger = { error: vi.fn() };

    await registerNotesWorkers(
      boss,
      baseDeps({ transcribeNote: vi.fn().mockResolvedValue(undefined), logger }),
    );

    const transcribeHandler = handlers.get(NOTE_TRANSCRIBE_QUEUE)!;
    await transcribeHandler([{ data: { noteId: 'note-1' } }]);

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('registers extractNote against note-extract and rethrows on failure (step 1.2)', async () => {
    const { boss, handlers } = fakeBoss();
    const error = new Error('extraction blew up');
    const logger = { error: vi.fn() };

    await registerNotesWorkers(
      boss,
      baseDeps({ extractNote: vi.fn().mockRejectedValue(error), logger }),
    );

    const extractHandler = handlers.get(NOTE_EXTRACT_QUEUE)!;
    await expect(extractHandler([{ data: { noteId: 'note-1' } }])).rejects.toThrow(
      'extraction blew up',
    );
    expect(logger.error).toHaveBeenCalledWith('[note-extract] job failed for note note-1:', error);
  });

  it('logs and rethrows when the audio lifecycle sweep fails', async () => {
    const { boss, handlers } = fakeBoss();
    const error = new Error('db unreachable');
    const logger = { error: vi.fn() };

    await registerNotesWorkers(
      boss,
      baseDeps({ sweepExpiredAudio: vi.fn().mockRejectedValue(error), logger }),
    );

    const sweepHandler = handlers.get(NOTE_AUDIO_LIFECYCLE_QUEUE)!;
    await expect(sweepHandler([])).rejects.toThrow('db unreachable');
    expect(logger.error).toHaveBeenCalledWith('[note-audio-lifecycle] sweep failed:', error);
  });

  it('defaults to console when no logger is injected', async () => {
    const { boss, handlers } = fakeBoss();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await registerNotesWorkers(
      boss,
      baseDeps({ transcribeNote: vi.fn().mockRejectedValue(new Error('boom')) }),
    );

    const transcribeHandler = handlers.get(NOTE_TRANSCRIBE_QUEUE)!;
    await expect(transcribeHandler([{ data: { noteId: 'note-2' } }])).rejects.toThrow('boom');

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
