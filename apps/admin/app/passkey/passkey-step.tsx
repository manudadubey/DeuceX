'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@deucex/ui';
import { post } from '@/lib/browser-api';
import { createClient } from '@/lib/supabase/client';

export function PasskeyStep({ name, registered }: { name: string; registered: boolean }) {
  const router = useRouter();
  const [hasPasskey, setHasPasskey] = useState(registered);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function register() {
    setBusy(true);
    setError(null);
    const { error: registerError } = await createClient().auth.registerPasskey();
    if (registerError) {
      setError(registerError.message);
      setBusy(false);
      return;
    }
    try {
      await post('/admin/auth/passkey-registered');
      setHasPasskey(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error: signInError } = await createClient().auth.signInWithPasskey();
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {hasPasskey
          ? `Welcome back, ${name}. Use your passkey to open the console. A sign-in link alone is never enough.`
          : `Hi ${name}. The console needs a passkey on this device before it opens. You'll use it every time you sign in.`}
      </p>
      {hasPasskey ? (
        <Button onClick={signIn} disabled={busy}>
          Use my passkey
        </Button>
      ) : (
        <Button onClick={register} disabled={busy}>
          Register a passkey
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <form action="/auth/signout" method="post">
        <button type="submit" className="text-sm text-muted-foreground underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
