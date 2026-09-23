'use server';

import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

// The confirm half of the fourteen-day cooling-off (decisions worksheet 4).
// A server action, not a bare GET handler, for the same link-scanner-safety
// reason apps/web/app/auth/confirm/actions.ts's own comment gives: a
// webmail scanner prefetching the emailed link must only render the page
// below, never consume the single-use token — that only happens from the
// server action a human click submits.
export async function confirmAccountDeletionAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  if (!token) redirect('/account/delete/confirm?error=1');

  const res = await fetch(`${API_URL}/account/delete/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) redirect('/account/delete/confirm?error=1');

  const result = (await res.json()) as { effectiveAt: string };
  redirect(`/signin?deletion_scheduled=${encodeURIComponent(result.effectiveAt)}`);
}
