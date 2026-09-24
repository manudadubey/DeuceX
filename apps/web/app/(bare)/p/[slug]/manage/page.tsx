'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, Spinner } from '@procircuit/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

// Step 4.1b · P-17: the page a patron's emailed manage link opens. It swaps
// the signed token for a Stripe customer-portal session and sends the
// patron there; Stripe's portal handles tier changes, card updates and
// cancellation, and returns them to the player's page.
export default function ManageMembershipPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { t?: string };
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchParams.t) {
      setError('This link is incomplete.');
      return;
    }
    void (async () => {
      const res = await fetch(`${API_URL}/public/p/${encodeURIComponent(params.slug)}/portal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: searchParams.t }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string };
      if (res.ok && body.url) {
        window.location.assign(body.url);
      } else {
        setError(
          res.status === 410
            ? 'This link has expired or has already been replaced.'
            : "Stripe couldn't open your membership just now.",
        );
      }
    })();
  }, [params.slug, searchParams.t]);

  return (
    <div className="mx-auto grid w-full max-w-xl gap-4 px-4 py-8">
      <Card className="grid gap-2 p-6">
        {error ? (
          <>
            <h1 className="text-xl font-semibold">{error}</h1>
            <p className="text-sm">
              Ask for a fresh link from the patron page. Each one works for an hour.
            </p>
            <Link href={`/p/${params.slug}`} className="text-sm underline">
              Back to the page
            </Link>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Opening your membership in Stripe…
          </p>
        )}
      </Card>
    </div>
  );
}
