import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@deucex/db';
import { calculateCost, recordRun, type AgentRunsDb } from '@deucex/actions';
import {
  INSIGHT_MODEL,
  INSIGHT_PROMPT_VERSION,
  INSIGHT_SCHEMA_VERSION,
  generateInsight,
  type GenerateInsightInput,
  type GenerateInsightResult,
  type InsightModelClient,
} from '@deucex/agents';
import {
  getExistingInsightHash,
  loadMindsetInputs,
  loadMindsetPlayer,
  openDistressCase,
  sendMindsetNotification,
  writeMindsetOutput,
} from './service';

export interface MindsetRunLogger {
  error(...args: unknown[]): void;
}

export interface MindsetRunDeps {
  db: SupabaseClient<Database>;
  client: InsightModelClient;
  agentRuns: AgentRunsDb;
  logger?: MindsetRunLogger;
}

function localDate(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
}

// MC-1: "cached on the input hash so unchanged inputs do not regenerate."
// Deliberately excludes `now` itself: two runs an hour apart with the same
// notes/check-ins/boundaries/feedback state hash identically, which is the
// point (a retried or re-triggered run for a day that already has a result
// is a no-op, not a second model call).
function computeInputsHash(input: Omit<GenerateInsightInput, 'now'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

// The daily Mindset Coach run (build plan step 1.3, PRD-06 section 3), the
// job body enqueued via packages/actions' AGENT_RUN_QUEUE (scheduler.ts
// decides *when* per player; this decides what a single run does once
// picked up). MC-15's pause is checked here, before anything else is even
// loaded: a paused player gets no insight row at all this morning, matching
// "resumes automatically, deletes nothing" — there is nothing to un-delete
// because nothing was ever written.
export async function runMindsetCoach(
  deps: MindsetRunDeps,
  playerId: string,
  now: Date = new Date(),
): Promise<void> {
  const logger = deps.logger ?? console;
  const player = await loadMindsetPlayer(deps.db, playerId);
  if (!player) return;

  const date = localDate(now, player.timezone);

  const { data: boundariesRow, error: boundariesError } = await deps.db
    .from('mindset_boundaries')
    .select('paused_until')
    .eq('player_id', playerId)
    .maybeSingle();
  if (boundariesError) throw boundariesError;
  if (boundariesRow?.paused_until && boundariesRow.paused_until >= date) return;

  const inputs = await loadMindsetInputs(deps.db, playerId, now, date);
  const promptInput: GenerateInsightInput = {
    lang: player.lang,
    timezone: player.timezone,
    notes: inputs.notes,
    checkins: inputs.checkins,
    existingPatterns: inputs.existingPatterns,
    quietMatchMornings: inputs.quietMatchMornings,
    // Tournament Agent input (step 3.2); always false until Entered events exist.
    hasMatchToday: false,
    notTodayCountLast7Days: inputs.notTodayCountLast7Days,
    recentFocuses: inputs.recentFocuses,
    now,
  };

  const inputsHash = computeInputsHash({
    lang: promptInput.lang,
    timezone: promptInput.timezone,
    notes: promptInput.notes,
    checkins: promptInput.checkins,
    existingPatterns: promptInput.existingPatterns,
    quietMatchMornings: promptInput.quietMatchMornings,
    hasMatchToday: promptInput.hasMatchToday,
    notTodayCountLast7Days: promptInput.notTodayCountLast7Days,
    recentFocuses: promptInput.recentFocuses,
  });

  const existingHash = await getExistingInsightHash(deps.db, playerId, date);
  if (existingHash === inputsHash) return;

  try {
    const { output } = await recordRun(
      deps.agentRuns,
      {
        agentName: 'mindset-coach',
        playerId,
        triggerType: 'schedule',
        inputsHash,
        model: INSIGHT_MODEL,
        promptVersion: INSIGHT_PROMPT_VERSION,
        schemaVersion: INSIGHT_SCHEMA_VERSION,
      },
      async () => {
        const result = await generateInsight(deps.client, promptInput);
        return result.usage
          ? { output: result as unknown as Json, usage: result.usage }
          : { output: result as unknown as Json };
      },
    );

    const result = output as unknown as GenerateInsightResult;
    const cost = result.usage ? calculateCost(INSIGHT_MODEL, result.usage) : null;

    await writeMindsetOutput(deps.db, {
      playerId,
      date,
      lang: player.lang,
      inputsHash,
      result,
      model: INSIGHT_MODEL,
      promptVersion: INSIGHT_PROMPT_VERSION,
      schemaVersion: INSIGHT_SCHEMA_VERSION,
      costAmount: cost?.amount ?? null,
      costCurrency: cost?.currency ?? null,
    });

    if (result.delivery === 'distress' && result.distress) {
      await openDistressCase(deps.db, playerId, result.distress.signals);
    }
    if (result.notify && result.notificationBody) {
      await sendMindsetNotification(deps.db, playerId, result.notificationBody);
    }
  } catch (err) {
    // Never swallowed (unlike note-extract's own failure path): a genuine
    // model/infra failure here should hit the queue's 5/20/60 minute retry
    // schedule (TECH-ARCHITECTURE.md section 3), not silently leave the
    // player without a morning insight.
    logger.error(`[mindset-coach] run failed for player ${playerId}:`, err);
    throw err;
  }
}
