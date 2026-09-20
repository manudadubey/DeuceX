'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function PasskeyRegister() {
  const [status, setStatus] = useState<'idle' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus('idle');
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.registerPasskey();
    if (error) {
      setStatus('error');
      setMessage(error.message);
      return;
    }
    setStatus('done');
    setMessage(`Registered passkey${data?.friendly_name ? ` (${data.friendly_name})` : ''}.`);
  }

  return (
    <div>
      <button type="button" onClick={handleClick}>
        Register a passkey
      </button>
      {message ? <p role={status === 'error' ? 'alert' : 'status'}>{message}</p> : null}
    </div>
  );
}
