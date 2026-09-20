import type { Database, Json } from '@procircuit/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AgentValidationError } from './errors';
import { calculateCost, type TokenUsage } from './pricing';

export type AgentRunTriggerType = 'schedule' | 'manual' | 'event' | 'threshold';
export type AgentRunStatus = 'succeeded' | 'failed_validation' | 'failed_infra' | 'degraded';

export interface AgentRunInsert {
  agentName: string;
  playerId: string;
  triggerType: AgentRunTriggerType;
  startedAt: Date;
  completedAt: Date;
  inputsHash: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  status: AgentRunStatus;
  output: Json | null;
  costAmount: number | null;
  costCurrency: string | null;
}

// What recordRun needs from a database, kept minimal for the same reason
// gate.ts's ApprovalGateDb is: so record-run.test.ts doesn't need a live
// Postgres connection to prove the wrapping behaviour.
export interface AgentRunsDb {
  insertAgentRun(row: AgentRunInsert): Promise<void>;
}

export class SupabaseAgentRunsDb implements AgentRunsDb {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async insertAgentRun(row: AgentRunInsert): Promise<void> {
    const { error } = await this.client.from('agent_runs').insert({
      agent_name: row.agentName,
      player_id: row.playerId,
      trigger_type: row.triggerType,
      started_at: row.startedAt.toISOString(),
      completed_at: row.completedAt.toISOString(),
      inputs_hash: row.inputsHash,
      model: row.model,
      prompt_version: row.promptVersion,
      schema_version: row.schemaVersion,
      status: row.status,
      output: row.output,
      cost_amount: row.costAmount,
      cost_currency: row.costCurrency,
    });
    if (error) throw error;
  }
}

export interface AgentRunMeta {
  agentName: string;
  playerId: string;
  triggerType: AgentRunTriggerType;
  inputsHash: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
}

export interface AgentCallResult {
  output: Json;
  usage?: TokenUsage;
}

// Wraps every model call an agent makes (TECH-ARCHITECTURE.md section 3:
// "every LLM call the worker makes is wrapped in a helper that records
// token counts and a cost estimate onto the agent_runs row it belongs to").
// Always writes exactly one agent_runs row, success or failure, then
// rethrows on failure so the caller's own retry logic (the queue, section 3)
// decides what happens next — recordRun's job is the audit row, not the
// retry policy.
export async function recordRun(
  db: AgentRunsDb,
  meta: AgentRunMeta,
  fn: () => Promise<AgentCallResult>,
): Promise<AgentCallResult> {
  const startedAt = new Date();

  try {
    const result = await fn();
    const cost = result.usage ? calculateCost(meta.model, result.usage) : null;

    await db.insertAgentRun({
      ...meta,
      startedAt,
      completedAt: new Date(),
      status: 'succeeded',
      output: result.output,
      costAmount: cost?.amount ?? null,
      costCurrency: cost?.currency ?? null,
    });

    return result;
  } catch (error) {
    const status: AgentRunStatus =
      error instanceof AgentValidationError ? 'failed_validation' : 'failed_infra';

    await db.insertAgentRun({
      ...meta,
      startedAt,
      completedAt: new Date(),
      status,
      output: null,
      costAmount: null,
      costCurrency: null,
    });

    throw error;
  }
}
