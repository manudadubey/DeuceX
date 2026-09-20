import { hashApprovalPayload } from '@procircuit/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.types';

// The check constraint on approvals.action_type (see the step 0.2 migration).
// Supabase's generated types don't reflect CHECK constraints as a literal
// union (approvals.action_type comes through as plain `string`), so this is
// hand-maintained: extending the list is the same additive migration the
// step 0.2 comments describe, plus this one line.
export type ApprovalActionType =
  | 'entry_confirm'
  | 'expense_save'
  | 'balance_update'
  | 'patron_send'
  | 'content_publish'
  | 'sponsor_send'
  | 'retract'
  | 'tier_change';

export interface CreateApprovalInput {
  playerId: string;
  actionType: ApprovalActionType;
  payload: Json;
  agentRunId?: string | null | undefined;
  device?: string | null | undefined;
}

export interface CreatedApproval {
  id: string;
  payloadHash: string;
}

// The player-side half of the approval gate (TECH-ARCHITECTURE.md section 3):
// "the only path from proposal to action runs through a player tap that
// creates the approval record first." Called with the player's own
// anon-scoped client, so `approvals_insert_own`'s RLS check
// (`player_id = auth.uid() and approved_by = auth.uid()`) does the real
// authorization — this function does not, and could not, insert on another
// player's behalf. `packages/actions`'s gate (the other half) independently
// recomputes `hashApprovalPayload` server-side rather than trusting the
// hash returned here; this return value is for the caller to pass alongside
// approvalId when it then calls the gated action.
export async function createApproval(
  client: SupabaseClient<Database>,
  input: CreateApprovalInput,
): Promise<CreatedApproval> {
  const { data, error } = await client
    .from('approvals')
    .insert({
      player_id: input.playerId,
      approved_by: input.playerId,
      action_type: input.actionType,
      payload: input.payload,
      agent_run_id: input.agentRunId ?? null,
      device: input.device ?? null,
    })
    .select('id')
    .single();

  if (error) throw error;

  return { id: data.id, payloadHash: hashApprovalPayload(input.payload) };
}
