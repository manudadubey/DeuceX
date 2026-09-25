'use client';

import { useState } from 'react';
import { Button } from '@deucex/ui';
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
    <div className="flex flex-col items-start gap-2">
      <Button variant="outline" onClick={handleClick}>
        Register a passkey
      </Button>
      {message ? (
        <p role={status === 'error' ? 'alert' : 'status'} className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
