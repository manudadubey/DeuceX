'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { ReceiptProposal } from '@procircuit/agents';

// The Financial Agent's one apps/api call with a real vendor side effect
// (the receipt-scanning vision model) — everything else about this page is
// a direct client Supabase call via packages/db (see financial-client.tsx),
// same split as apps/web/lib/match-scribe/api.ts's own comment.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export class FinancialApiError extends Error {}
export class ReceiptExtractionFailedError extends Error {}

async function authHeaders(supabase: SupabaseClient<Database>): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new FinancialApiError('Not signed in');
  return { Authorization: `Bearer ${token}` };
}

export interface ScanReceiptResponse {
  proposal: ReceiptProposal;
}

// F description: "If extraction fails or exceeds 10 seconds, the item opens
// as a blank form" — the 10-second budget is enforced here with
// AbortController, not on the server, since PRD-03's own words describe it
// as a client-perceived timeout.
const EXTRACTION_TIMEOUT_MS = 10_000;

export async function scanReceipt(
  supabase: SupabaseClient<Database>,
  file: Blob,
): Promise<ScanReceiptResponse> {
  const headers = await authHeaders(supabase);
  const form = new FormData();
  form.append('image', file, 'receipt.jpg');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/financial/receipts`, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    });
    if (res.status === 422) throw new ReceiptExtractionFailedError("We couldn't read this one.");
    if (!res.ok) throw new FinancialApiError(`Receipt scan failed: ${res.status}`);
    return (await res.json()) as ScanReceiptResponse;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ReceiptExtractionFailedError("We couldn't read this one in time.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// F-1: "immediately on every saved expense, every balance update and every
// receivable marked received" — called right after each of those direct
// Supabase writes succeeds. Fire-and-forget from the caller's perspective:
// a failure here just means this morning's cached figures go stale a
// little longer, never blocks the write the player already made — so this
// swallows its own errors (e.g. apps/api not running) rather than leaving
// every call site to remember a .catch(), which is what an unhandled
// rejection here would otherwise become.
export async function requestFinancialRecompute(supabase: SupabaseClient<Database>): Promise<void> {
  try {
    const headers = await authHeaders(supabase);
    await fetch(`${API_URL}/financial/recompute`, { method: 'POST', headers });
  } catch (err) {
    console.warn('[financial] recompute request failed (non-fatal):', err);
  }
}

export interface ReceiveReceivableResult {
  realisedAmountHome: number;
  newReserveBalance: number;
}

// The confirm half of F-9/M-DATA-2's gated transition: called after
// @/lib/approvals/confirm-approval's confirmApproval has already created
// the matching approvals row. apps/api's own markReceivableReceived
// re-verifies the payload hash independently rather than trusting this call.
export async function receiveReceivable(
  supabase: SupabaseClient<Database>,
  input: {
    approvalId: string;
    receivableId: string;
    receivedDate: string;
    realisedHomeCurrency: string;
  },
): Promise<ReceiveReceivableResult> {
  const headers = await authHeaders(supabase);
  const res = await fetch(`${API_URL}/financial/receivables/${input.receivableId}/receive`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      approvalId: input.approvalId,
      receivedDate: input.receivedDate,
      realisedHomeCurrency: input.realisedHomeCurrency,
    }),
  });
  if (!res.ok) throw new FinancialApiError(`Mark received failed: ${res.status}`);
  return (await res.json()) as ReceiveReceivableResult;
}
