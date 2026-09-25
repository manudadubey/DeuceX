'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';

// Data & safety's apps/api calls (PRD-12 §4.10): the two gated actions
// (delete/export requests, a real Resend send behind each) plus the plain
// cancel and manual audio-delete calls, which have no vendor side effect
// but still need the service-role client, same split as
// apps/web/lib/financial/api.ts's own comment.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export class AccountApiError extends Error {}

async function authHeaders(supabase: SupabaseClient<Database>): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AccountApiError('Not signed in');
  return { Authorization: `Bearer ${token}` };
}

// The confirm half runs unauthenticated (apps/web/app/account/delete/confirm),
// so it calls fetch directly rather than through this file's authHeaders.

export async function requestAccountDeletion(
  supabase: SupabaseClient<Database>,
  approvalId: string,
): Promise<void> {
  const headers = await authHeaders(supabase);
  const res = await fetch(`${API_URL}/account/delete/request`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ approvalId }),
  });
  if (!res.ok) throw new AccountApiError(`Deletion request failed: ${res.status}`);
}

export async function cancelAccountDeletion(supabase: SupabaseClient<Database>): Promise<void> {
  const headers = await authHeaders(supabase);
  const res = await fetch(`${API_URL}/account/delete/cancel`, { method: 'POST', headers });
  if (!res.ok) throw new AccountApiError(`Cancel failed: ${res.status}`);
}

export async function requestDataExport(
  supabase: SupabaseClient<Database>,
  approvalId: string,
): Promise<void> {
  const headers = await authHeaders(supabase);
  const res = await fetch(`${API_URL}/account/export/request`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ approvalId }),
  });
  if (!res.ok) throw new AccountApiError(`Export request failed: ${res.status}`);
}

export interface DeleteAllAudioResult {
  deletedCount: number;
}

export async function deleteAllAudio(
  supabase: SupabaseClient<Database>,
): Promise<DeleteAllAudioResult> {
  const headers = await authHeaders(supabase);
  const res = await fetch(`${API_URL}/notes/audio/delete-all`, { method: 'POST', headers });
  if (!res.ok) throw new AccountApiError(`Audio delete failed: ${res.status}`);
  return (await res.json()) as DeleteAllAudioResult;
}
