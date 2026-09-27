'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { BillingCycle, PaidPlan } from '@deucex/shared';

// A player's own plan through apps/api (docs/BILLING-DECISIONS.md): the
// three calls that reach Stripe. Starting a trial and dropping a card-less
// trial to Free are database functions (@deucex/db's startTrial and
// downgradeToFree) and don't come through here.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export class BillingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function post<T>(
  supabase: SupabaseClient<Database>,
  path: string,
  body: unknown,
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new BillingApiError('Not signed in', 401);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new BillingApiError("Couldn't reach DeuceX's billing service. Try again in a moment.", 0);
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new BillingApiError(
      detail?.error ?? `Billing request failed (${res.status})`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

/** Opens Stripe Checkout for a plan; the approval names the same plan and cycle. */
export function startCheckout(
  supabase: SupabaseClient<Database>,
  input: { approvalId: string; plan: PaidPlan; cycle: BillingCycle },
): Promise<{ url: string }> {
  return post(supabase, '/billing/checkout', input);
}

export type CompleteCheckoutResult =
  | { state: 'open' }
  | {
      state: 'complete';
      plan: PaidPlan;
      cycle: BillingCycle;
      tierStatus: string;
      firstChargeAt: string | null;
    };

export function completeCheckout(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<CompleteCheckoutResult> {
  return post(supabase, '/billing/checkout/complete', { sessionId });
}

export function cancelPaidPlan(
  supabase: SupabaseClient<Database>,
  approvalId: string,
): Promise<{ effective: 'now' | 'period_end'; effectiveAt: string | null }> {
  return post(supabase, '/billing/cancel', { approvalId });
}
