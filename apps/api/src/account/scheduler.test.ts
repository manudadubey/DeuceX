import { describe, expect, it, vi } from 'vitest';
import type { StorageAdapter } from '../storage/adapter';
import { sweepDueDeletions, type AccountDeletionSweepDb, type DueForDeletion } from './scheduler';

function fakeStorage(): StorageAdapter {
  return {
    upload: vi.fn(),
    download: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe('sweepDueDeletions', () => {
  it('deletes audio before deleting the user, for every due player', async () => {
    const due: DueForDeletion[] = [
      { playerId: 'player-1', audioRefs: ['player-1/note-a.webm', 'player-1/note-b.webm'] },
      { playerId: 'player-2', audioRefs: [] },
    ];
    const calls: string[] = [];
    const storage = fakeStorage();
    (storage.delete as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      calls.push(`storage:${key}`);
    });
    const deleteUser = vi.fn().mockImplementation(async (playerId: string) => {
      calls.push(`user:${playerId}`);
    });
    const db: AccountDeletionSweepDb = {
      async findDueForDeletion() {
        return due;
      },
      deleteUser,
    };

    const result = await sweepDueDeletions({ db, storage }, new Date('2026-10-08T00:00:00Z'));

    expect(result.deletedPlayerIds).toEqual(['player-1', 'player-2']);
    expect(calls).toEqual([
      'storage:player-1/note-a.webm',
      'storage:player-1/note-b.webm',
      'user:player-1',
      'user:player-2',
    ]);
  });

  it('still deletes the user when a storage delete fails (best-effort, never blocks the account deletion)', async () => {
    const due: DueForDeletion[] = [{ playerId: 'player-1', audioRefs: ['player-1/note-a.webm'] }];
    const storage = fakeStorage();
    (storage.delete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('R2 unavailable'));
    const deleteUser = vi.fn().mockResolvedValue(undefined);
    const db: AccountDeletionSweepDb = {
      async findDueForDeletion() {
        return due;
      },
      deleteUser,
    };

    const result = await sweepDueDeletions({ db, storage }, new Date());

    expect(deleteUser).toHaveBeenCalledWith('player-1');
    expect(result.deletedPlayerIds).toEqual(['player-1']);
  });

  it('deletes nobody when no player is due', async () => {
    const storage = fakeStorage();
    const deleteUser = vi.fn();
    const db: AccountDeletionSweepDb = {
      async findDueForDeletion() {
        return [];
      },
      deleteUser,
    };

    const result = await sweepDueDeletions({ db, storage }, new Date());

    expect(result.deletedPlayerIds).toEqual([]);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
