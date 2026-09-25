'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';

// Fans' apps/api calls. The four gated ones (onboard, tiers, send, invite)
// are called only after @/lib/approvals/confirm-approval's confirmApproval
// has created the matching approvals row; apps/api re-verifies the payload
// hash itself, same split as lib/tournament/api.ts. Everything the page
// merely reads (patrons, events, payouts) is a direct RLS-scoped query in
// ./load.ts instead.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export class FansApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function authHeaders(supabase: SupabaseClient<Database>): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new FansApiError('Not signed in', 401);
  return { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

async function post<T>(
  supabase: SupabaseClient<Database>,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: await authHeaders(supabase),
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { error?: string }).error;
    throw new FansApiError(detail ?? `Request failed: ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

export function startConnectOnboarding(supabase: SupabaseClient<Database>, approvalId: string) {
  return post<{ url: string; slug: string }>(supabase, '/fans/connect/onboard', { approvalId });
}

export function refreshConnectAccount(supabase: SupabaseClient<Database>) {
  return post<{ kycStatus: string }>(supabase, '/fans/connect/refresh', {});
}

export function publishTier(
  supabase: SupabaseClient<Database>,
  input: { approvalId: string; position: number; name: string; price: number; perks: string },
) {
  return post<{ tierId: string; patronsAffectedByPrice: number; patronsOnTier: number }>(
    supabase,
    '/fans/tiers',
    input,
  );
}

export function draftPatronNote(supabase: SupabaseClient<Database>, patronId: string) {
  return post<{ kind: string; text: string | null }>(
    supabase,
    `/fans/patrons/${patronId}/draft`,
    {},
  );
}

export function sendPatronNote(
  supabase: SupabaseClient<Database>,
  patronId: string,
  input: { approvalId: string; kind: string; text: string; draftText: string | null },
) {
  return post<{ patronId: string; sentAt: string }>(
    supabase,
    `/fans/patrons/${patronId}/send`,
    input,
  );
}

export function inviteFromWaitlist(
  supabase: SupabaseClient<Database>,
  entryId: string,
  approvalId: string,
) {
  return post<{ entryId: string; invitedAt: string }>(
    supabase,
    `/fans/waitlist/${entryId}/invite`,
    {
      approvalId,
    },
  );
}

export interface PatronBillingResult {
  changed: number;
  failed: string[];
  /** Billing changed, but the notice email didn't reach them (or no email on file). */
  unnotified: string[];
}

// Step 4.1b · P-18: both run after confirmApproval created the matching
// patron_billing_pause / patron_billing_resume approval (payload {}).
export function pausePatronBilling(supabase: SupabaseClient<Database>, approvalId: string) {
  return post<PatronBillingResult>(supabase, '/fans/billing/pause', { approvalId });
}

export function resumePatronBilling(supabase: SupabaseClient<Database>, approvalId: string) {
  return post<PatronBillingResult>(supabase, '/fans/billing/resume', { approvalId });
}
