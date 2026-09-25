import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import {
  SupabaseApprovalGateDb,
  SupabaseEntriesDb,
  confirmEntry,
  withdrawEntry,
  type ConfirmEntryResult,
  type WithdrawEntryResult,
} from '@deucex/actions';

export interface ConfirmTournamentEntryInput {
  approvalId: string;
  playerId: string;
  tournamentId: string;
  device?: string | null;
}

// PRD-01 T-9/T-11: apps/web creates the approval row directly (RLS-scoped,
// packages/db's createApproval), then calls this over
// POST /tournament/entries/:id/accept or /withdraw, on the service-role
// client — the only thing that can actually write entry_decisions.status to
// entered/withdrawn or a real_tournament_id-linked ledger_lines row. Same
// shape as financial/receivables.ts's receiveReceivable.
export async function acceptTournamentEntry(
  db: SupabaseClient<Database>,
  input: ConfirmTournamentEntryInput,
): Promise<ConfirmEntryResult> {
  return confirmEntry(new SupabaseApprovalGateDb(db), new SupabaseEntriesDb(db), {
    approvalId: input.approvalId,
    playerId: input.playerId,
    tournamentId: input.tournamentId,
    device: input.device ?? null,
  });
}

export async function withdrawTournamentEntry(
  db: SupabaseClient<Database>,
  input: ConfirmTournamentEntryInput,
): Promise<WithdrawEntryResult> {
  return withdrawEntry(new SupabaseApprovalGateDb(db), new SupabaseEntriesDb(db), {
    approvalId: input.approvalId,
    playerId: input.playerId,
    tournamentId: input.tournamentId,
    device: input.device ?? null,
  });
}
