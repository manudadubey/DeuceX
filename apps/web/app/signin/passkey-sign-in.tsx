'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function PasskeySignIn() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPasskey();
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={handleClick}>
        Use a passkey instead
      </button>
      {error ? <span role="alert"> {error}</span> : null}
    </>
  );
}
