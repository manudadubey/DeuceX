import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@procircuit/db';
import { recordRun, type AgentRunsDb, type AgentRunTriggerType } from '@procircuit/actions';
import {
  FINANCIAL_ACTION_MODEL,
  FINANCIAL_ACTION_SCHEMA_VERSION,
  computeBurnState,
  computeGrossWeeklySpend,
  computeWeeklyBudgetBar,
  generateFinancialAction,
  rankActionCandidates,
  type ActionCandidate,
  type FinancialActionModelClient,
  type GenerateFinancialActionResult,
} from '@procircuit/agents';
import { loadFinancialInputs, loadFinancialPlayer, sendFinancialNotification } from './service';

export interface FinancialRunLogger {
  error(...args: unknown[]): void;
}

export interface FinancialRunDeps {
  db: SupabaseClient<Database>;
  client: FinancialActionModelClient;
  agentRuns: AgentRunsDb;
  logger?: FinancialRunLogger;
}

// What action-candidates.ts's ranking actually depends on: hashing just
// this (not the whole input bundle, unlike mindset-coach's own
// computeInputsHash) is what lets an expense save that doesn't change which
// candidate wins skip the model call entirely — "live runs recompute
// figures without regenerating the action" (PRD-03 section 3).
function candidateHash(candidate: ActionCandidate): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        key: candidate.key,
        facts: candidate.facts,
        effectWeeks: candidate.effectWeeks,
      }),
    )
    .digest('hex');
}

interface CachedAction {
  candidateKey: string;
  effectWeeks: number;
  text: string;
  secondSentence: string | null;
  inputsHash: string;
}

async function getLatestFinancialAction(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<CachedAction | null> {
  const { data, error } = await db
    .from('agent_runs')
    .select('inputs_hash, output, status')
    .eq('player_id', playerId)
    .eq('agent_name', 'financial')
    .eq('status', 'succeeded')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.output) return null;
  return data.output as unknown as CachedAction;
}

export interface RunFinancialAgentResult {
  action:
    | GenerateFinancialActionResult
    | { candidateKey: string; effectWeeks: number; text: string; secondSentence: string | null };
  cached: boolean;
}

// The scheduled-and-event Financial Agent run (PRD-03 section 3): loads
// inputs, deterministically ranks the "one thing" candidates
// (action-candidates.ts), and only calls the model when the winning
// candidate's own facts changed since the last run — the deterministic
// runway/burn/budget/P&L figures apps/web reads live and directly (see
// financial-client.tsx) are recomputed on every read regardless, which is
// what "recompute figures without regenerating the action" actually means
// here: this function's whole job is the action text and its agent_runs
// audit row, not the KPI numbers themselves.
export async function runFinancialAgent(
  deps: FinancialRunDeps,
  playerId: string,
  triggerType: AgentRunTriggerType,
  now: Date = new Date(),
): Promise<RunFinancialAgentResult | null> {
  const logger = deps.logger ?? console;
  const player = await loadFinancialPlayer(deps.db, playerId);
  if (!player) return null;

  const inputs = await loadFinancialInputs(deps.db, playerId, player.homeCurrency, now);
  const grossWeeklySpend = computeGrossWeeklySpend(inputs.ledgerLines, now);
  const burn = computeBurnState(grossWeeklySpend, inputs.patronMrr);
  const weeklyBudgetBar =
    player.weeklyBudget != null
      ? computeWeeklyBudgetBar(inputs.ledgerLines, player.weeklyBudget, now)
      : null;

  const overdueReceivables = inputs.pendingReceivables; // action-candidates.ts applies its own 7-day threshold
  const candidates = rankActionCandidates(
    {
      lastReserveEntryAt: inputs.lastReserveEntryAt,
      overdueReceivables,
      weeklyBudgetBar,
      netBurn: burn.netBurn,
      now,
    },
    inputs.snoozedKeys,
  );
  const winner = candidates[0];
  if (!winner) return null; // never happens: update_balance is always in the pool

  const hash = candidateHash(winner);
  const cached = await getLatestFinancialAction(deps.db, playerId);
  if (cached && cached.inputsHash === hash) {
    return { action: cached, cached: true };
  }

  try {
    const { output } = await recordRun(
      deps.agentRuns,
      {
        agentName: 'financial',
        playerId,
        triggerType,
        inputsHash: hash,
        model: FINANCIAL_ACTION_MODEL,
        promptVersion: '1',
        schemaVersion: FINANCIAL_ACTION_SCHEMA_VERSION,
      },
      async () => {
        const result = await generateFinancialAction(deps.client, winner);
        return { output: { ...result, inputsHash: hash } as unknown as Json, usage: result.usage };
      },
    );

    const action = output as unknown as GenerateFinancialActionResult;
    if (triggerType === 'schedule') {
      await sendFinancialNotification(deps.db, playerId, action.text);
    }

    return { action, cached: false };
  } catch (err) {
    logger.error(`[financial] run failed for player ${playerId}:`, err);
    throw err;
  }
}
