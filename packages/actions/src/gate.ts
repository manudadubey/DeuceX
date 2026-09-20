import { type ApprovalActionType, type Database, type Json } from '@procircuit/db';
import { hashApprovalPayload } from '@procircuit/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ApprovalActionMismatchError,
  ApprovalAlreadyConsumedError,
  ApprovalNotFoundError,
  ApprovalPayloadMismatchError,
} from './errors';

export interface ApprovalRecord {
  id: string;
  playerId: string;
  actionType: string;
  payload: Json;
}

// The one interface every real action function in this module is built on
// (TECH-ARCHITECTURE.md section 3: "every function in that module takes an
// approval_id as its first argument and, before doing anything, verifies...
// that a matching, unconsumed, player-authored approval exists"). Kept
// narrow and DB-client-agnostic on purpose so runGatedAction's own tests
// don't need a live Postgres connection — see gate.test.ts.
export interface ApprovalGateDb {
  getApproval(approvalId: string, playerId: string): Promise<ApprovalRecord | null>;
  /** Atomically claims the approval. Returns false if it was already claimed. */
  claimApproval(input: {
    approvalId: string;
    playerId: string;
    agentRunId: string | null;
    payloadHash: string;
  }): Promise<boolean>;
}

// The real, Postgres-backed implementation. `claimApproval` relies on
// `approval_consumptions.approval_id` being a primary key (step 0.6
// migration): a unique-violation on that insert means someone already
// claimed it, which is what makes "verify unconsumed, then consume" one
// atomic statement instead of a check-then-act race between two concurrent
// callers. Untested here beyond typechecking — it needs a live Postgres
// connection, which this sandbox and CI both lack (same gap
// packages/db/src/rls.integration.test.ts already documents); the pure
// decision logic in runGatedAction below is what gate.test.ts covers.
export class SupabaseApprovalGateDb implements ApprovalGateDb {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getApproval(approvalId: string, playerId: string): Promise<ApprovalRecord | null> {
    const { data, error } = await this.client
      .from('approvals')
      .select('id, player_id, action_type, payload')
      .eq('id', approvalId)
      .eq('player_id', playerId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      playerId: data.player_id,
      actionType: data.action_type,
      payload: data.payload,
    };
  }

  async claimApproval(input: {
    approvalId: string;
    playerId: string;
    agentRunId: string | null;
    payloadHash: string;
  }): Promise<boolean> {
    const { error } = await this.client.from('approval_consumptions').insert({
      approval_id: input.approvalId,
      player_id: input.playerId,
      agent_run_id: input.agentRunId,
      payload_hash: input.payloadHash,
    });

    if (!error) return true;
    if (error.code === '23505') return false; // unique_violation on approval_id: already claimed
    throw error;
  }
}

export interface RunGatedActionInput {
  approvalId: string;
  playerId: string;
  actionType: ApprovalActionType;
  payload: Json;
  agentRunId?: string | null;
}

// The gate itself. Any function that calls a vendor SDK (Stripe, Resend,
// ICS, the entry client) is expected to call this first and only proceed
// inside `sideEffect`. Claims the approval before running `sideEffect`
// (not after): if the vendor call then throws, the approval stays consumed
// rather than being replayable, which is the safer failure direction —
// the alternative (claim after a successful vendor call) risks calling the
// vendor twice if the claim step itself fails. A genuine vendor failure
// here means the player re-confirms, creating a fresh approval, which is
// consistent with M-GATE-3 ("the UI says when [an approval isn't] reversible").
export async function runGatedAction<T>(
  db: ApprovalGateDb,
  input: RunGatedActionInput,
  sideEffect: () => Promise<T>,
): Promise<T> {
  const approval = await db.getApproval(input.approvalId, input.playerId);
  if (!approval) {
    throw new ApprovalNotFoundError(input.approvalId);
  }
  if (approval.actionType !== input.actionType) {
    throw new ApprovalActionMismatchError(input.approvalId, input.actionType, approval.actionType);
  }

  const expectedHash = await hashApprovalPayload(approval.payload);
  const suppliedHash = await hashApprovalPayload(input.payload);
  if (expectedHash !== suppliedHash) {
    throw new ApprovalPayloadMismatchError(input.approvalId);
  }

  const claimed = await db.claimApproval({
    approvalId: input.approvalId,
    playerId: input.playerId,
    agentRunId: input.agentRunId ?? null,
    payloadHash: suppliedHash,
  });
  if (!claimed) {
    throw new ApprovalAlreadyConsumedError(input.approvalId);
  }

  return sideEffect();
}
