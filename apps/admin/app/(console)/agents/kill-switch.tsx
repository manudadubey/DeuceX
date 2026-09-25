'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Switch, Textarea } from '@deucex/ui';
import { post } from '@/lib/browser-api';

const WINDOW_MS = 5000;

// AD-16 and AD-AC-6: the first click on an On switch changes nothing and
// asks for a reason and a second click within five seconds; only the second
// click turns the provider off. The reason is stored verbatim (AD-5).
export function KillSwitch({
  provider,
  label,
  state,
  wired,
  dependents,
}: {
  provider: string;
  label: string;
  state: 'on' | 'off';
  wired: boolean;
  dependents: string[];
}) {
  const router = useRouter();
  const [armedUntil, setArmedUntil] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function send(next: 'on' | 'off') {
    setBusy(true);
    setError(null);
    try {
      await post(`/admin/providers/${provider}`, { state: next, reason });
      setArmedUntil(null);
      setReason('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onChange() {
    setError(null);
    if (state === 'off') {
      if (!reason.trim()) {
        setArmedUntil(Date.now() + 60_000);
        return;
      }
      void send('on');
      return;
    }
    const now = Date.now();
    if (armedUntil && now <= armedUntil) {
      if (!reason.trim()) {
        setError('Write a reason first. It is stored verbatim in the audit log.');
        return;
      }
      void send('off');
      return;
    }
    setArmedUntil(now + WINDOW_MS);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setArmedUntil((a) => (a && Date.now() > a ? null : a)),
      WINDOW_MS + 50,
    );
  }

  const armed = armedUntil !== null;

  return (
    <div className="flex flex-col gap-2">
      <Switch
        checked={state === 'on'}
        onCheckedChange={onChange}
        disabled={!wired || busy}
        aria-label={`${label}: ${state === 'on' ? 'on' : 'off'}`}
      />
      {armed ? (
        <div className="flex flex-col gap-1.5 text-[0.8125rem]">
          <span className="text-warn">
            {state === 'on'
              ? `Click again within five seconds to turn ${label} off. ${dependents.join(', ')} will pause for every player.`
              : `Write a reason, then click again to turn ${label} back on.`}
          </span>
          <Textarea
            aria-label="Reason"
            rows={2}
            className="min-h-14"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required, stored verbatim)"
          />
        </div>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
