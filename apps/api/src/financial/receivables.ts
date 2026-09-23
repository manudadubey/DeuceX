import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import {
  MissingReceivedDateRateError,
  ReceivableNotFoundOrAlreadyReceivedError,
  SupabaseApprovalGateDb,
  SupabaseReceivablesDb,
  markReceivableReceived,
  type ReceivedReceivableResult,
} from '@procircuit/actions';

export interface ReceiveReceivableInput {
  approvalId: string;
  playerId: string;
  receivableId: string;
  receivedDate: string;
  realisedHomeCurrency: string;
}

// The one Financial Agent transition TECH-ARCHITECTURE.md section 3 names
// as gated the same as a Stripe/Resend/ICS call (build plan step 2.1's own
// words): apps/web creates the approval row directly (RLS-scoped,
// packages/db's createApproval), then calls this over
// POST /financial/receivables/:id/receive, on the service-role client —
// the only thing that can actually write prize_receivables.status or a
// cause=received_prize reserve_entries row (see the step 2.1 migration's
// own RLS design notes on both tables).
export async function receiveReceivable(
  db: SupabaseClient<Database>,
  input: ReceiveReceivableInput,
): Promise<ReceivedReceivableResult> {
  return markReceivableReceived(new SupabaseApprovalGateDb(db), new SupabaseReceivablesDb(db), {
    approvalId: input.approvalId,
    playerId: input.playerId,
    receivableId: input.receivableId,
    receivedDate: input.receivedDate,
    realisedHomeCurrency: input.realisedHomeCurrency,
  });
}

export { MissingReceivedDateRateError, ReceivableNotFoundOrAlreadyReceivedError };
