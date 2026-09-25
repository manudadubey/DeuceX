import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { ProviderState } from '@deucex/actions';
import type { AgentJobData, AgentWorkerDeps } from '@deucex/actions/queue';

// The pickup-time checks and failure records every AGENT_RUN_QUEUE worker
// shares (step 0.6's queue, PRD-13 AD-14 to AD-16). Before step 5.1 each
// worker carried its own copy of the first two; the console's global pause
// and failed-runs list made a single source worth having.

/** Paused for this player (agent_schedules) or globally by ops (agent_global_pauses, latest row wins). */
export async function getAgentPaused(
  db: SupabaseClient<Database>,
  agentName: string,
  playerId: string,
): Promise<boolean> {
  const [own, global] = await Promise.all([
    db
      .from('agent_schedules')
      .select('paused')
      .eq('agent_name', agentName)
      .eq('player_id', playerId)
      .maybeSingle(),
    db
      .from('agent_global_pauses')
      .select('paused')
      .eq('agent_name', agentName)
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (own.error) throw own.error;
  if (global.error) throw global.error;
  return (own.data?.paused ?? false) || (global.data?.paused ?? false);
}

export async function getProviderStates(
  db: SupabaseClient<Database>,
  providers: readonly string[],
): Promise<Record<string, ProviderState>> {
  const states: Record<string, ProviderState> = {};
  for (const provider of providers) {
    const { data, error } = await db
      .from('provider_switches')
      .select('state')
      .eq('provider', provider)
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    // "A provider with no row yet is implicitly on" (TECH-ARCHITECTURE.md 2.4).
    states[provider] = (data?.state as ProviderState | undefined) ?? 'on';
  }
  return states;
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, 500);
}

// PRD-00 section 5.6's player-facing sentence after the last retry fails.
export const RUN_DID_NOT_COMPLETE_TITLE = "This morning's run didn't complete";

/**
 * The run_failures writer (AD-14): one row per (agent, player, window),
 * opened on the first failed attempt, bumped on each retry, marked
 * exhausted (and the player told, once) on the last, closed on success.
 */
export function createRunFailureHooks(
  db: SupabaseClient<Database>,
  agentLabel: string,
): Pick<AgentWorkerDeps, 'onAttemptFailed' | 'onSucceeded'> {
  return {
    async onAttemptFailed(job: AgentJobData, error: unknown, info) {
      const now = new Date().toISOString();
      const { data: existing } = await db
        .from('run_failures')
        .select('id, player_told_at')
        .eq('agent_name', job.agentName)
        .eq('player_id', job.playerId)
        .eq('scheduled_window', job.scheduledWindow)
        .maybeSingle();

      const exhaustedAt = info.exhausted ? now : null;
      let alreadyTold = false;
      if (existing) {
        alreadyTold = existing.player_told_at !== null;
        await db
          .from('run_failures')
          .update({
            attempts: info.attempt,
            last_error: errorText(error),
            last_failed_at: now,
            exhausted_at: exhaustedAt,
            resolved_at: null,
            resolution: null,
          })
          .eq('id', existing.id);
      } else {
        await db.from('run_failures').insert({
          agent_name: job.agentName,
          player_id: job.playerId,
          scheduled_window: job.scheduledWindow,
          trigger_type: job.triggerType,
          attempts: info.attempt,
          last_error: errorText(error),
          exhausted_at: exhaustedAt,
        });
      }

      if (info.exhausted && !alreadyTold) {
        await db.from('notifications').insert({
          player_id: job.playerId,
          agent: job.agentName,
          category: 'for_you',
          title: RUN_DID_NOT_COMPLETE_TITLE,
          body: `${agentLabel} couldn't finish this run after three retries. Nothing was sent or changed. It will try again at the next scheduled run.`,
        });
        await db
          .from('run_failures')
          .update({ player_told_at: now })
          .eq('agent_name', job.agentName)
          .eq('player_id', job.playerId)
          .eq('scheduled_window', job.scheduledWindow);
        // A plain insert: dedupe_key's unique index is partial, which
        // PostgREST's on_conflict can't target; a duplicate is simply ignored.
        await db.from('alerts').insert({
          kind: 'run_exhausted',
          category: 'act',
          title: `${agentLabel} failed three retries`,
          body: errorText(error),
          link: '/agents',
          role_owner: 'ops',
          player_id: job.playerId,
          dedupe_key: `run_exhausted:${job.agentName}:${job.playerId}:${job.scheduledWindow}`,
        });
      }
    },

    async onSucceeded(job: AgentJobData) {
      await db
        .from('run_failures')
        .update({ resolved_at: new Date().toISOString(), resolution: 'succeeded' })
        .eq('agent_name', job.agentName)
        .eq('player_id', job.playerId)
        .eq('scheduled_window', job.scheduledWindow)
        .is('resolved_at', null);
    },
  };
}
