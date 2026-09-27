import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@deucex/db';
import type { EndMembershipsForErasureResult } from '@deucex/actions/fans';
import type { PgBoss } from 'pg-boss';
import type { StorageAdapter } from '../storage/adapter';
import { ACCOUNT_DELETION_SWEEP_QUEUE } from '../money/queue';

// The finalising half of the fourteen-day cooling-off (decisions worksheet
// 4, PRD-12 ST-19). confirmAccountDeletion (packages/actions/src/account.ts)
// sets deletion_effective_at; this sweep is what actually makes it
// irreversible once that moment passes.
//
// Step 5.4 turns it into the GDPR erasure job TECH-ARCHITECTURE.md section 7
// asks for: "an explicit, tracked deletion job with a completion record, not
// assumed from a deleted Postgres row". Each processor that holds the
// player's data is reached in turn and what happened is written to
// erasure_records.steps, before and after the database row goes:
//   stripe      every patron membership cancelled and each patron told
//               (owner decision, 26 September 2026); the connected account
//               itself is kept (the player's own, and Stripe must keep its
//               records). If any cancellation fails, the sweep stops before
//               deleting anything, so a patron is never left being charged
//               for a player who no longer exists; tomorrow's sweep retries.
//   storage     note audio in R2 (menu and receipt photos are deleted when
//               read, so there are none to find).
//   queue       the player's pg-boss jobs, queued or finished.
//   database    auth.users, cascading through every player table.
//   resend, openai, backups
//               recorded as what they are: vendor-held logs with no deletion
//               API, and no managed backups on the current plan.

export type ErasureOutcome = 'done' | 'none' | 'failed' | 'kept' | 'retention_limited';

export interface ErasureStep {
  processor: string;
  outcome: ErasureOutcome;
  detail: string;
  at: string;
}

export interface DueForDeletion {
  playerId: string;
  audioRefs: string[];
  deletionRequestedAt: string | null;
  deletionEffectiveAt: string;
}

// Narrow on purpose (mirrors every other *Db interface in this codebase):
// sweepDueDeletions' own ordering and stop rules are what this file's test
// proves, without a live Postgres, Supabase admin connection or Stripe.
export interface AccountDeletionSweepDb {
  findDueForDeletion(now: Date): Promise<DueForDeletion[]>;
  /** Opens (or reopens, after a sweep that stopped) the player's erasure record. */
  startErasureRecord(player: DueForDeletion, at: Date): Promise<void>;
  saveErasureRecord(
    playerId: string,
    patch: {
      steps: ErasureStep[];
      status: 'running' | 'completed' | 'partial';
      completedAt: Date | null;
    },
  ): Promise<void>;
  /** Deletes the player's pg-boss jobs. Returns how many. */
  purgeQueuedJobs(playerId: string): Promise<number>;
  /** Cascades through every FK'd table (players.id references auth.users.id on delete cascade). */
  deleteUser(playerId: string): Promise<void>;
}

/** apps/api's wrapper round @deucex/actions/fans' endMembershipsForErasure; null when Stripe isn't configured. */
export type EndMemberships = (playerId: string) => Promise<EndMembershipsForErasureResult>;

export interface SweepResult {
  deletedPlayerIds: string[];
  /** Players whose erasure stopped before the database delete (a Stripe cancellation failed). */
  stoppedPlayerIds: string[];
}

// Vendor-held copies with no deletion API. Worded for the console's Trust
// and safety page and for an auditor, not for the player.
const RETENTION_STEPS: ReadonlyArray<Omit<ErasureStep, 'at'>> = [
  {
    processor: 'resend',
    outcome: 'retention_limited',
    detail:
      'Sent-email logs stay with Resend for its own retention period; Resend has no API to delete them.',
  },
  {
    processor: 'openai',
    outcome: 'retention_limited',
    detail:
      'Model inputs may be kept by the provider for up to 30 days for abuse monitoring and are not used for training; there is no deletion API.',
  },
  {
    processor: 'backups',
    outcome: 'none',
    detail:
      'No managed backups on the current Supabase plan; restore-drill dumps are deleted when each drill ends.',
  },
];

export async function sweepDueDeletions(
  deps: {
    db: AccountDeletionSweepDb;
    storage: StorageAdapter;
    endMemberships: EndMemberships | null;
  },
  now: Date,
): Promise<SweepResult> {
  const due = await deps.db.findDueForDeletion(now);
  const result: SweepResult = { deletedPlayerIds: [], stoppedPlayerIds: [] };

  for (const player of due) {
    const steps: ErasureStep[] = [];
    const step = (processor: string, outcome: ErasureOutcome, detail: string) =>
      steps.push({ processor, outcome, detail, at: new Date().toISOString() });
    await deps.db.startErasureRecord(player, now);

    // Stripe first: once the player row cascades away there is no record of
    // which subscriptions to cancel.
    if (!deps.endMemberships) {
      step(
        'stripe',
        'failed',
        'Stripe is not configured on this server, so patron memberships could not be checked.',
      );
    } else {
      try {
        const ended = await deps.endMemberships(player.playerId);
        if (!ended.programme) {
          step('stripe', 'none', 'No patron programme.');
        } else if (ended.failed.length > 0) {
          step(
            'stripe',
            'failed',
            `${ended.failed.length} membership cancellation(s) failed; ${ended.cancelled} cancelled, ${ended.notified} patron(s) emailed. Retried on the next sweep.`,
          );
        } else {
          step(
            'stripe',
            'done',
            `${ended.cancelled} membership(s) cancelled, ${ended.notified} patron(s) emailed. The connected account is kept: it is the player's own, and Stripe must keep its records.`,
          );
        }
      } catch (err) {
        step(
          'stripe',
          'failed',
          `Stripe call failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (steps.some((s) => s.processor === 'stripe' && s.outcome === 'failed')) {
      await deps.db.saveErasureRecord(player.playerId, {
        steps,
        status: 'partial',
        completedAt: null,
      });
      result.stoppedPlayerIds.push(player.playerId);
      continue;
    }

    // Audio next, for the same reason: the notes rows hold the keys. A
    // storage failure is best-effort, same as the scheduled audio sweep
    // (notes/audio-lifecycle.ts), and must not block the erasure itself.
    let audioDeleted = 0;
    for (const ref of player.audioRefs) {
      try {
        await deps.storage.delete(ref);
        audioDeleted++;
      } catch {
        // counted below
      }
    }
    const audioFailed = player.audioRefs.length - audioDeleted;
    step(
      'storage',
      audioFailed > 0 ? 'failed' : player.audioRefs.length > 0 ? 'done' : 'none',
      player.audioRefs.length === 0
        ? 'No note audio held.'
        : `${audioDeleted} of ${player.audioRefs.length} audio file(s) deleted.`,
    );

    try {
      const purged = await deps.db.purgeQueuedJobs(player.playerId);
      step('queue', purged > 0 ? 'done' : 'none', `${purged} queued or finished job(s) deleted.`);
    } catch (err) {
      step(
        'queue',
        'failed',
        `Job purge failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await deps.db.deleteUser(player.playerId);
    step('database', 'done', 'Sign-in identity and every player table deleted.');
    for (const s of RETENTION_STEPS) step(s.processor, s.outcome, s.detail);

    await deps.db.saveErasureRecord(player.playerId, {
      steps,
      status: steps.some((s) => s.outcome === 'failed') ? 'partial' : 'completed',
      completedAt: new Date(),
    });
    result.deletedPlayerIds.push(player.playerId);
  }

  return result;
}

export class SupabaseAccountDeletionSweepDb implements AccountDeletionSweepDb {
  constructor(
    private readonly client: SupabaseClient<Database>,
    /** The pg-boss instance whose job table holds this player's jobs. */
    private readonly boss: PgBoss | null = null,
  ) {}

  async findDueForDeletion(now: Date): Promise<DueForDeletion[]> {
    const { data, error } = await this.client
      .from('players')
      .select('id, deletion_requested_at, deletion_effective_at')
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
        deletionRequestedAt: row.deletion_requested_at,
        deletionEffectiveAt: row.deletion_effective_at!,
        audioRefs: (notes ?? [])
          .map((n) => n.audio_ref)
          .filter((ref): ref is string => ref != null),
      });
    }
    return due;
  }

  async startErasureRecord(player: DueForDeletion, at: Date): Promise<void> {
    // Upsert on player_id: a sweep that stopped yesterday (Stripe) reopens
    // the same record rather than starting a second one.
    const { error } = await this.client.from('erasure_records').upsert(
      {
        player_id: player.playerId,
        deletion_requested_at: player.deletionRequestedAt,
        deletion_effective_at: player.deletionEffectiveAt,
        started_at: at.toISOString(),
        status: 'running',
        completed_at: null,
      },
      { onConflict: 'player_id' },
    );
    if (error) throw error;
  }

  async saveErasureRecord(
    playerId: string,
    patch: {
      steps: ErasureStep[];
      status: 'running' | 'completed' | 'partial';
      completedAt: Date | null;
    },
  ): Promise<void> {
    const { error } = await this.client
      .from('erasure_records')
      .update({
        steps: patch.steps as unknown as Json,
        status: patch.status,
        completed_at: patch.completedAt?.toISOString() ?? null,
      })
      .eq('player_id', playerId);
    if (error) throw error;
  }

  async purgeQueuedJobs(playerId: string): Promise<number> {
    if (!this.boss) return 0;
    const rows = (await this.boss
      .getDb()
      .executeSql(`delete from pgboss.job where data->>'playerId' = $1 returning id`, [
        playerId,
      ])) as { rows?: unknown[] } | unknown[];
    return Array.isArray(rows) ? rows.length : (rows.rows?.length ?? 0);
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
  endMemberships: EndMemberships | null;
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
      const result = await sweepDueDeletions(
        { db: deps.db, storage: deps.storage, endMemberships: deps.endMemberships },
        now,
      );
      if (result.stoppedPlayerIds.length > 0) {
        logger.error(
          `[account-deletion-scheduler] erasure stopped before the delete for ${result.stoppedPlayerIds.length} player(s); see erasure_records`,
        );
      }
    } catch (err) {
      logger.error('[account-deletion-scheduler] tick failed:', err);
      throw err;
    }
  });
}
