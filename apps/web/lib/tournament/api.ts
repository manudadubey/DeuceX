'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';

// The Tournament Agent's two apps/api calls with a real gated side effect
// (Accept entry, Withdraw) — Skip and Undo are direct, RLS-scoped client
// Supabase calls via packages/db's skipCandidate/undoSkip, same split as
// apps/web/lib/financial/api.ts's own comment.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export class TournamentApiError extends Error {}

async function authHeaders(supabase: SupabaseClient<Database>): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new TournamentApiError('Not signed in');
  return { Authorization: `Bearer ${token}` };
}

export interface AcceptEntryResult {
  tournamentId: string;
  plannedExpenseId: string;
  plannedAmount: number;
  plannedCurrency: string;
}

// PRD-01 T-9: called after @/lib/approvals/confirm-approval's confirmApproval
// has already created the matching approvals row (payload { tournamentId },
// action_type 'entry_confirm'). apps/api's confirmEntry re-verifies the
// payload hash independently and reads the planned amount from its own
// current shortlist_candidates row, never trusting this call for the number.
export async function acceptTournamentEntry(
  supabase: SupabaseClient<Database>,
  input: { approvalId: string; tournamentId: string },
): Promise<AcceptEntryResult> {
  const headers = await authHeaders(supabase);
  const res = await fetch(`${API_URL}/tournament/entries/${input.tournamentId}/accept`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ approvalId: input.approvalId }),
  });
  if (!res.ok) throw new TournamentApiError(`Accept entry failed: ${res.status}`);
  return (await res.json()) as AcceptEntryResult;
}

export interface WithdrawEntryResult {
  tournamentId: string;
}

// PRD-01 T-11: action_type 'retract'. Refused with a 422 once the entry
// deadline has passed (apps/api maps EntryDeadlinePassedError there); the
// caller shows the player-zone-link footer copy in that case, per the PRD's
// own "withdrawal must be done on the player zone" language.
export async function withdrawTournamentEntry(
  supabase: SupabaseClient<Database>,
  input: { approvalId: string; tournamentId: string },
): Promise<WithdrawEntryResult> {
  const headers = await authHeaders(supabase);
  const res = await fetch(`${API_URL}/tournament/entries/${input.tournamentId}/withdraw`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ approvalId: input.approvalId }),
  });
  if (res.status === 422) {
    throw new TournamentApiError('deadline_passed');
  }
  if (!res.ok) throw new TournamentApiError(`Withdraw failed: ${res.status}`);
  return (await res.json()) as WithdrawEntryResult;
}
