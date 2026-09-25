'use client';

import { createApproval, type ApprovalActionType, type CreatedApproval } from '@deucex/db';
import type { Json } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';

export interface ConfirmApprovalInput {
  playerId: string;
  actionType: ApprovalActionType;
  payload: Json;
  agentRunId?: string | null;
}

// What a `Confirm`'s primary action calls (Baseline §The approval gate;
// TECH-ARCHITECTURE.md section 3): a player's own tap creates the approvals
// row directly through their own session, so `approvals_insert_own`'s RLS
// check (player_id = approved_by = auth.uid()) is the real authorization,
// not this function. The returned approvalId is then passed to whichever
// packages/actions function performs the actual side effect, which
// independently re-verifies the payload hash rather than trusting this call.
//
// Not yet called from a real screen: no agent has a proposal to confirm
// until Phase 1. Kept here, tested, so the first real Confirm usage is
// "call this" rather than "invent this."
export async function confirmApproval(input: ConfirmApprovalInput): Promise<CreatedApproval> {
  const supabase = createClient();
  return createApproval(supabase, {
    playerId: input.playerId,
    actionType: input.actionType,
    payload: input.payload,
    agentRunId: input.agentRunId,
    device: typeof navigator === 'undefined' ? null : navigator.userAgent,
  });
}
