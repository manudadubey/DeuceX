import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { StorageAdapter } from '../storage/adapter';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface AudioLifecycleDeps {
  db: SupabaseClient<Database>;
  storage: StorageAdapter;
}

export interface SweepResult {
  deletedCount: number;
}

// The 7-day half of M-PRIV-1 / S-13 ("... or 7 days after upload, whichever
// is first"). The other half — immediate deletion on Save — happens
// synchronously in notes/service.ts's saveNote(); this sweep is the
// backstop for a note that never reaches 'saved' (stuck in review, or the
// player just never comes back to it). Takes `now` as a parameter rather
// than reading the clock itself so a test can time-travel without waiting
// seven real days or mocking global Date.
export async function sweepExpiredAudio(deps: AudioLifecycleDeps, now: Date): Promise<SweepResult> {
  const cutoff = new Date(now.getTime() - SEVEN_DAYS_MS).toISOString();

  const { data: expired, error } = await deps.db
    .from('notes')
    .select('id, audio_ref')
    .not('audio_ref', 'is', null)
    .lte('audio_uploaded_at', cutoff);
  if (error) throw error;

  let deletedCount = 0;
  for (const row of expired ?? []) {
    if (!row.audio_ref) continue;
    await deps.storage.delete(row.audio_ref).catch(() => undefined);
    const { error: updateError } = await deps.db
      .from('notes')
      .update({
        audio_ref: null,
        audio_deleted_at: now.toISOString(),
        audio_delete_cause: 'expired',
      })
      .eq('id', row.id);
    if (!updateError) deletedCount++;
  }

  return { deletedCount };
}
