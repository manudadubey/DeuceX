'use client';

import { useState } from 'react';
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Input,
} from '@procircuit/ui';
import { formatPatronMoney } from '@procircuit/agents';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export interface PublicPatronPage {
  slug: string;
  playerName: string;
  state: 'open' | 'full' | 'closed';
  tiers: Array<{ id: string; name: string; price: number; currency: string; perks: string }>;
  thanksLine: string | null;
  feePercent: number | null;
}

// Step 4.1b · P-17: a patron's way to change tier, update their card or
// cancel. Patrons have no ProCircuit login, so the page emails a one-hour
// link to Stripe's own portal. The reply is identical whether or not the
// email backs this player, so the form can't reveal who does.
function ManageMembership({ page, firstName }: { page: PublicPatronPage; firstName: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError(null);
    const res = await fetch(`${API_URL}/public/p/${page.slug}/manage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      setState('done');
    } else {
      setError(
        ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Please try again.',
      );
      setState('idle');
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="min-h-11 justify-self-start text-sm underline"
        onClick={() => setOpen(true)}
      >
        Already backing {firstName}? Change tier, update your card or cancel
      </button>
    );
  }
  if (state === 'done') {
    return (
      <p className="text-sm">
        If that email backs {firstName}, a link to manage your membership is on its way. It works
        for one hour.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <Field>
        <FieldLabel htmlFor="manage-email">The email you signed up with</FieldLabel>
        <Input
          id="manage-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button type="submit" variant="outline" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Email me a link'}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </form>
  );
}

function Waitlist({ page, firstName }: { page: PublicPatronPage; firstName: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError(null);
    const res = await fetch(`${API_URL}/public/p/${page.slug}/waitlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      setState('done');
    } else {
      setError(
        ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Please try again.',
      );
      setState('idle');
    }
  };

  if (state === 'done') {
    return (
      <p className="text-sm">
        You&apos;re on the list. {firstName} will invite you by email when a place opens.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <p className="text-sm">
        {firstName}&apos;s page is full for now. Leave your email and you&apos;ll be first in when a
        place opens.
      </p>
      <Field>
        <FieldLabel htmlFor="waitlist-email">Email</FieldLabel>
        <Input
          id="waitlist-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Adding you…' : 'Join the waitlist'}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        Your email is used only to invite you. Nothing is charged.
      </p>
    </form>
  );
}

export function PatronPage({ page, source }: { page: PublicPatronPage; source: string }) {
  const firstName = page.playerName.split(/\s+/)[0] ?? page.playerName;
  const [namesOptIn, setNamesOptIn] = useState(false);
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [full, setFull] = useState(page.state === 'full');
  const [error, setError] = useState<string | null>(null);

  const become = async (tierId: string) => {
    setBusyTier(tierId);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/public/p/${page.slug}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tierId, source, namesOptIn }),
      });
      const body = (await res.json()) as {
        kind?: 'checkout' | 'waitlist';
        url?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? 'Checkout could not open.');
      if (body.kind === 'waitlist') {
        setFull(true); // M-TIER-3: filled up since the page loaded; the waitlist, never an error.
        return;
      }
      window.location.assign(body.url!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout could not open.');
    } finally {
      setBusyTier(null);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-xl gap-4 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Back the season</p>
        <h1 className="text-2xl font-semibold">{page.playerName}</h1>
      </header>

      {page.state === 'closed' ? (
        <Card className="p-5 text-sm text-muted-foreground">
          {firstName} isn&apos;t taking patrons on this page yet.
        </Card>
      ) : full ? (
        <Card className="p-5">
          <Waitlist page={page} firstName={firstName} />
        </Card>
      ) : (
        <>
          {page.tiers.map((tier, i) => (
            <Card
              key={tier.id}
              className={
                i === 1 ? 'shadow-[0_0_0_2px_var(--ring),0_1px_2px_rgba(0,0,0,.05)]' : undefined
              }
            >
              <CardHeader>
                <CardTitle>{tier.name}</CardTitle>
                <CardDescription>{tier.perks}</CardDescription>
              </CardHeader>
              <div className="flex items-center justify-between gap-3 px-5 pb-5 max-sm:px-4">
                <span className="font-mono text-lg">
                  {formatPatronMoney(tier.price, tier.currency, tier.price % 1 ? 2 : 0)}
                  <small className="text-sm text-muted-foreground"> a month</small>
                </span>
                <Button disabled={busyTier !== null} onClick={() => become(tier.id)}>
                  {busyTier === tier.id ? 'Opening checkout…' : 'Become a patron'}
                </Button>
              </div>
            </Card>
          ))}
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={namesOptIn}
              onChange={(e) => setNamesOptIn(e.target.checked)}
            />
            <span>
              Thank me by first name on {firstName}&apos;s page. Only your first name is ever shown.
            </span>
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <p className="text-xs text-muted-foreground">
            You pay the monthly price shown and nothing more, through Stripe; ProCircuit never sees
            your card. From it, Stripe takes its processing charge and ProCircuit takes{' '}
            {page.feePercent ?? 8}%; the rest goes to {firstName}.
          </p>
        </>
      )}

      {page.thanksLine ? <p className="text-sm text-muted-foreground">{page.thanksLine}</p> : null}

      <ManageMembership page={page} firstName={firstName} />
    </div>
  );
}
