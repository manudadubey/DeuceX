'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@deucex/ui';
import { post } from '@/lib/browser-api';

// Re-runs the nightly aggregation now (it is idempotent per agent and day).
export function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await post<{ agents: number }>('/admin/aggregation/run');
            setMessage(`Aggregated ${r.agents} agent-days`);
            router.refresh();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Refresh
      </Button>
    </span>
  );
}
