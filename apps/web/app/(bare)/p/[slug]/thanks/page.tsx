'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, Spinner } from '@procircuit/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

// Stripe Checkout's success_url. Calls apps/api's idempotent reconcile, the
// same join the checkout.session.completed webhook applies, so the patron is
// recorded within seconds even if the webhook is delayed (P-6's "within a
// minute").
export default function PatronThanksPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { session_id?: string };
}) {
  const [state, setState] = useState<'working' | 'done' | 'pending'>('working');
  const [who, setWho] = useState<{ firstName: string; tierName: string } | null>(null);

  useEffect(() => {
    const sessionId = searchParams.session_id;
    if (!sessionId) {
      setState('pending');
      return;
    }
    let tries = 0;
    const attempt = async () => {
      const res = await fetch(`${API_URL}/public/p/${encodeURIComponent(params.slug)}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) {
        setWho((await res.json()) as { firstName: string; tierName: string });
        setState('done');
      } else if (res.status === 409 && tries++ < 5) {
        setTimeout(attempt, 2000);
      } else {
        setState('pending');
      }
    };
    void attempt();
  }, [params.slug, searchParams.session_id]);

  return (
    <div className="mx-auto grid w-full max-w-xl gap-4 px-4 py-8">
      <Card className="grid gap-2 p-6">
        {state === 'working' ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Confirming with Stripe…
          </p>
        ) : state === 'done' && who ? (
          <>
            <h1 className="text-xl font-semibold">Thank you, {who.firstName}.</h1>
            <p className="text-sm">
              You&apos;re on {who.tierName}. The next update comes to your inbox.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Thank you.</h1>
            <p className="text-sm">
              Stripe has your payment. It can take a minute to show up on the page.
            </p>
          </>
        )}
        <Link href={`/p/${params.slug}`} className="text-sm underline">
          Back to the page
        </Link>
      </Card>
    </div>
  );
}
