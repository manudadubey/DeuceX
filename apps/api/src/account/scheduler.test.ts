import { describe, expect, it, vi } from 'vitest';
import type { StorageAdapter } from '../storage/adapter';
import {
  sweepDueDeletions,
  type AccountDeletionSweepDb,
  type DueForDeletion,
  type EndMemberships,
  type ErasureStep,
} from './scheduler';

function fakeStorage(): StorageAdapter {
  return {
    upload: vi.fn(),
    download: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function due(playerId: string, audioRefs: string[] = []): DueForDeletion {
  return {
    playerId,
    audioRefs,
    deletionRequestedAt: '2026-09-24T09:00:00Z',
    deletionEffectiveAt: '2026-10-08T09:00:00Z',
  };
}

function fakeDb(players: DueForDeletion[], calls: string[] = []) {
  const records = new Map<
    string,
    { status: string; steps: ErasureStep[]; completedAt: Date | null; started: number }
  >();
  const db: AccountDeletionSweepDb = {
    async findDueForDeletion() {
      return players;
    },
    async startErasureRecord(player) {
      calls.push(`record:${player.playerId}`);
      const prior = records.get(player.playerId);
      records.set(player.playerId, {
        status: 'running',
        steps: [],
        completedAt: null,
        started: (prior?.started ?? 0) + 1,
      });
    },
    async saveErasureRecord(playerId, patch) {
      const r = records.get(playerId)!;
      records.set(playerId, { ...r, ...patch });
    },
    async purgeQueuedJobs(playerId) {
      calls.push(`queue:${playerId}`);
      return 2;
    },
    deleteUser: vi.fn(async (playerId: string) => {
      calls.push(`user:${playerId}`);
    }),
  };
  return { db, records };
}

const noProgramme: EndMemberships = async () => ({
  programme: false,
  cancelled: 0,
  notified: 0,
  failed: [],
});

describe('sweepDueDeletions (the erasure job, step 5.4)', () => {
  it('ends memberships, deletes audio and jobs, then the user, and writes a completed record', async () => {
    const calls: string[] = [];
    const storage = fakeStorage();
    (storage.delete as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      calls.push(`storage:${key}`);
    });
    const { db, records } = fakeDb(
      [due('player-1', ['player-1/note-a.webm', 'player-1/note-b.webm']), due('player-2')],
      calls,
    );
    const endMemberships: EndMemberships = vi.fn(async (playerId: string) => {
      calls.push(`stripe:${playerId}`);
      return playerId === 'player-1'
        ? { programme: true, cancelled: 3, notified: 2, failed: [] }
        : { programme: false, cancelled: 0, notified: 0, failed: [] };
    });

    const result = await sweepDueDeletions(
      { db, storage, endMemberships },
      new Date('2026-10-08T10:00:00Z'),
    );

    expect(result).toEqual({ deletedPlayerIds: ['player-1', 'player-2'], stoppedPlayerIds: [] });
    expect(calls.slice(0, 6)).toEqual([
      'record:player-1',
      'stripe:player-1',
      'storage:player-1/note-a.webm',
      'storage:player-1/note-b.webm',
      'queue:player-1',
      'user:player-1',
    ]);

    const record = records.get('player-1')!;
    expect(record.status).toBe('completed');
    expect(record.completedAt).toBeInstanceOf(Date);
    expect(record.steps.map((s) => [s.processor, s.outcome])).toEqual([
      ['stripe', 'done'],
      ['storage', 'done'],
      ['queue', 'done'],
      ['database', 'done'],
      ['resend', 'retention_limited'],
      ['openai', 'retention_limited'],
      ['backups', 'none'],
    ]);
    expect(record.steps[0]!.detail).toContain('3 membership(s) cancelled, 2 patron(s) emailed');
    expect(records.get('player-2')!.steps[0]).toMatchObject({ outcome: 'none' });
  });

  it('stops before deleting anything when a membership cancellation fails, and retries next sweep', async () => {
    const storage = fakeStorage();
    const { db, records } = fakeDb([due('player-1', ['player-1/note-a.webm'])]);
    let failing = true;
    const endMemberships: EndMemberships = async () =>
      failing
        ? { programme: true, cancelled: 1, notified: 1, failed: ['tom'] }
        : { programme: true, cancelled: 1, notified: 1, failed: [] };

    const first = await sweepDueDeletions({ db, storage, endMemberships }, new Date());
    expect(first).toEqual({ deletedPlayerIds: [], stoppedPlayerIds: ['player-1'] });
    expect(db.deleteUser).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(records.get('player-1')).toMatchObject({ status: 'partial', completedAt: null });

    failing = false;
    const second = await sweepDueDeletions({ db, storage, endMemberships }, new Date());
    expect(second.deletedPlayerIds).toEqual(['player-1']);
    const record = records.get('player-1')!;
    expect(record.status).toBe('completed');
    expect(record.started).toBe(2); // the same record, reopened
  });

  it("never deletes a player when Stripe isn't configured, since their patrons could still be charged", async () => {
    const { db, records } = fakeDb([due('player-1')]);
    const result = await sweepDueDeletions(
      { db, storage: fakeStorage(), endMemberships: null },
      new Date(),
    );
    expect(result.stoppedPlayerIds).toEqual(['player-1']);
    expect(db.deleteUser).not.toHaveBeenCalled();
    expect(records.get('player-1')!.status).toBe('partial');
  });

  it('still erases when an audio delete fails, and marks the record partial', async () => {
    const storage = fakeStorage();
    (storage.delete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('R2 unavailable'));
    const { db, records } = fakeDb([due('player-1', ['player-1/note-a.webm'])]);

    const result = await sweepDueDeletions(
      { db, storage, endMemberships: noProgramme },
      new Date(),
    );

    expect(db.deleteUser).toHaveBeenCalledWith('player-1');
    expect(result.deletedPlayerIds).toEqual(['player-1']);
    const record = records.get('player-1')!;
    expect(record.status).toBe('partial');
    expect(record.steps.find((s) => s.processor === 'storage')).toMatchObject({
      outcome: 'failed',
      detail: '0 of 1 audio file(s) deleted.',
    });
  });

  it('does nothing when no one is due', async () => {
    const { db, records } = fakeDb([]);
    const result = await sweepDueDeletions(
      { db, storage: fakeStorage(), endMemberships: noProgramme },
      new Date(),
    );
    expect(result).toEqual({ deletedPlayerIds: [], stoppedPlayerIds: [] });
    expect(records.size).toBe(0);
  });
});
