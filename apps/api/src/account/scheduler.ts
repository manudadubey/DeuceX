import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { PgBoss } from 'pg-boss';
import type { StorageAdapter } from '../storage/adapter';
import { ACCOUNT_DELETION_SWEEP_QUEUE } from '../money/queue';

// The finalising half of the fourteen-day cooling-off (decisions worksheet
// 4, PRD-12 ST-19). confirmAccountDeletion (packages/actions/src/account.ts)
// sets deletion_effective_at; this sweep is what actually makes it
// irreversible once that moment passes. Unit-tested against fakes only —
// never run against the real Supabase project in this session, since
// nothing in current data can reach the threshold yet and this is
// genuinely destructive.

export interface DueForDeletion {
  playerId: string;
  audioRefs: string[];
}

// Narrow on purpose (mirrors every other *Db interface in this codebase):
// sweepDueDeletions' own logic — which players are due, audio before user,
// never a partial delete on a storage failure that should block the rest —
// is what this file's test proves, without a live Postgres or Supabase
// admin connection.
export interface AccountDeletionSweepDb {
  findDueForDeletion(now: Date): Promise<DueForDeletion[]>;
  /** Cascades through every FK'd table (players.id references auth.users.id on delete cascade) — see the step 2.3 migration's design notes for the one known gap (admin_actions has no cascade/set-null). */
  deleteUser(playerId: string): Promise<void>;
}

export interface SweepResult {
  deletedPlayerIds: string[];
}

export async function sweepDueDeletions(
  deps: { db: AccountDeletionSweepDb; storage: StorageAdapter },
  now: Date,
): Promise<SweepResult> {
  const due = await deps.db.findDueForDeletion(now);
  const deletedPlayerIds: string[] = [];

  for (const player of due) {
    // Audio first: once deleteUser cascades the notes rows away, there is
    // no audio_ref left to look up. A storage failure is best-effort, same
    // as the scheduled audio sweep (notes/audio-lifecycle.ts) — it must not
    // block the account deletion itself.
    for (const ref of player.audioRefs) {
      await deps.storage.delete(ref).catch(() => undefined);
    }
    await deps.db.deleteUser(player.playerId);
    deletedPlayerIds.push(player.playerId);
  }

  return { deletedPlayerIds };
}

export class SupabaseAccountDeletionSweepDb implements AccountDeletionSweepDb {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async findDueForDeletion(now: Date): Promise<DueForDeletion[]> {
    const { data, error } = await this.client
      .from('players')
      .select('id')
      .not('deletion_effective_at', 'is', null)
      .lte('deletion_effective_at', now.toISOString())
      .is('deletion_cancelled_at', null);
    if (error) throw error;

    const due: DueForDeletion[] = [];
    for (const row of data ?? []) {
      const { data: notes, error: notesError } = await this.client
        .from('notes')
        .select('audio_ref')
        .eq('player_id', row.id)
        .not('audio_ref', 'is', null);
      if (notesError) throw notesError;
      due.push({
        playerId: row.id,
        audioRefs: (notes ?? [])
          .map((n) => n.audio_ref)
          .filter((ref): ref is string => ref != null),
      });
    }
    return due;
  }

  async deleteUser(playerId: string): Promise<void> {
    // service-role only — deleting an auth.users row is an admin API call,
    // never reachable from a player's own anon-scoped session.
    const { error } = await this.client.auth.admin.deleteUser(playerId);
    if (error) throw error;
  }
}

export interface AccountSchedulerDeps {
  db: AccountDeletionSweepDb;
  storage: StorageAdapter;
  logger?: { error(...args: unknown[]): void };
  now?: () => Date;
}

export async function registerAccountDeletionScheduler(
  boss: PgBoss,
  deps: AccountSchedulerDeps,
): Promise<void> {
  const logger = deps.logger ?? console;

  await boss.work(ACCOUNT_DELETION_SWEEP_QUEUE, async () => {
    try {
      const now = (deps.now ?? (() => new Date()))();
      await sweepDueDeletions({ db: deps.db, storage: deps.storage }, now);
    } catch (err) {
      logger.error('[account-deletion-scheduler] tick failed:', err);
      throw err;
    }
  });
}
