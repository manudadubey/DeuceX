'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, FieldDescription, FieldLabel, Input } from '@deucex/ui';
import { apiRequest } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';

export function SignInForm({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  async function requestLink(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest(
        '/admin/auth/sign-in-link',
        { token: null },
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        },
      );
      setSent(email);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function passkey() {
    setError(null);
    const { error: signInError } = await createClient().auth.signInWithPasskey();
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground">
        If {sent} holds a console role, a sign-in link is on its way. It works once and expires
        within the hour.
      </p>
    );
  }

  return (
    <form onSubmit={requestLink} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="email">Staff email</FieldLabel>
        <Input
          id="email"
          type="email"
          autoComplete="username webauthn"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FieldDescription>
          We email a link to staff addresses only. A registered passkey is required before the
          console opens.
        </FieldDescription>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </Field>
      <Button type="submit" disabled={busy}>
        Email me a sign-in link
      </Button>
      <Button type="button" variant="outline" onClick={passkey}>
        Sign in with a passkey
      </Button>
    </form>
  );
}
