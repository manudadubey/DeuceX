import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@deucex/db';
import type { PgBoss } from 'pg-boss';
import { CONDITIONS_STAMP_BACKFILL_QUEUE } from '../money/queue';
import { computeNoteStamp } from './stamp';
import type { WeatherAdapter } from './adapter';

const BACKFILL_WINDOW_HOURS = 24;

export interface ConditionsStampBackfillDeps {
  db: SupabaseClient<Database>;
  weatherAdapter: WeatherAdapter;
  logger?: { error(...args: unknown[]): void };
  now?: () => Date;
}

// CE-11/section 3's failure behaviour: "if a stamp cannot be produced at
// save the note saves without one and is backfilled within 24 hours." Notes
// older than the window are left alone — past that point the Entered event
// may itself have ended or moved on, and a much-later stamp would describe
// conditions no longer worth attaching (PRD-08 never asks for a permanent
// retry).
export async function registerConditionsStampBackfillScheduler(
  boss: PgBoss,
  deps: ConditionsStampBackfillDeps,
): Promise<void> {
  const logger = deps.logger ?? console;

  await boss.work(CONDITIONS_STAMP_BACKFILL_QUEUE, async () => {
    const now = (deps.now ?? (() => new Date()))();
    const windowStart = new Date(now.getTime() - BACKFILL_WINDOW_HOURS * 60 * 60 * 1000);

    const { data: notes, error } = await deps.db
      .from('notes')
      .select('id, player_id, recorded_at')
      .eq('status', 'saved')
      .eq('ctx', 'match')
      .is('cond', null)
      .gte('recorded_at', windowStart.toISOString());
    if (error) throw error;

    for (const note of notes ?? []) {
      try {
        const cond = await computeNoteStamp(
          { db: deps.db, weatherAdapter: deps.weatherAdapter },
          note.player_id,
          note.recorded_at,
        );
        if (cond) {
          const { error: updateError } = await deps.db
            .from('notes')
            .update({ cond: cond as unknown as Json })
            .eq('id', note.id);
          if (updateError) throw updateError;
        }
      } catch (err) {
        logger.error(`[conditions-stamp-backfill] failed for note ${note.id}:`, err);
      }
    }
  });
}
