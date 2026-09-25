import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { SupabaseApprovalGateDb } from '@deucex/actions';
import {
  MissingPlayerEmailError,
  SupabaseAccountDb,
  cancelAccountDeletion,
  confirmAccountDeletion,
  requestAccountDeletion,
  requestDataExport,
  type EmailClient,
} from '@deucex/actions/account';

// The two Settings writes with a real vendor side effect (an email through
// Resend), gated the same as receiveReceivable (../financial/receivables.ts)
// — apps/web creates the approval row directly (RLS-scoped), then calls
// this over the routes below, on the service-role client.

export async function requestDeletion(
  db: SupabaseClient<Database>,
  email: EmailClient,
  input: { approvalId: string; playerId: string; appBaseUrl: string },
): ReturnType<typeof requestAccountDeletion> {
  return requestAccountDeletion(
    new SupabaseApprovalGateDb(db),
    email,
    new SupabaseAccountDb(db),
    input,
  );
}

export async function confirmDeletion(
  db: SupabaseClient<Database>,
  token: string,
): ReturnType<typeof confirmAccountDeletion> {
  return confirmAccountDeletion(new SupabaseAccountDb(db), token);
}

export async function cancelDeletion(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<void> {
  return cancelAccountDeletion(new SupabaseAccountDb(db), playerId);
}

export async function requestExport(
  db: SupabaseClient<Database>,
  email: EmailClient,
  input: { approvalId: string; playerId: string },
): Promise<void> {
  return requestDataExport(new SupabaseApprovalGateDb(db), email, new SupabaseAccountDb(db), input);
}

export { MissingPlayerEmailError };
