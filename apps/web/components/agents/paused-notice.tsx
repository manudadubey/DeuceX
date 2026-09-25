'use client';

import { useEffect, useState } from 'react';
import { PauseCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// PRD-13 AD-15 and AD-16: when DeuceX pauses an agent for everyone, or
// switches off a provider it depends on, the agent's page says so plainly.
// Pausing stops new proposals only; nothing already approved is undone.
// Reads only the state (never who or why), which is all the step 5.1
// migration grants a player.
export function PausedNotice({
  agent,
  providers = [],
  label,
}: {
  agent?: string;
  providers?: readonly string[];
  label: string;
}) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    async function check() {
      const checks: Promise<boolean>[] = [];
      if (agent) {
        checks.push(
          Promise.resolve(
            supabase
              .from('agent_global_pauses')
              .select('paused')
              .eq('agent_name', agent)
              .order('changed_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          ).then(({ data }) => data?.paused ?? false),
        );
      }
      for (const provider of providers) {
        checks.push(
          Promise.resolve(
            supabase
              .from('provider_switches')
              .select('state')
              .eq('provider', provider)
              .order('changed_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          ).then(({ data }) => data?.state === 'off'),
        );
      }
      const results = await Promise.all(checks);
      setPaused(results.some(Boolean));
    }
    void check().catch(() => setPaused(false));
  }, [agent, providers]);

  if (!paused) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg bg-warn-bg p-3 text-sm text-warn"
    >
      <PauseCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        {label} is paused by DeuceX for the moment. It won&rsquo;t make new suggestions until it
        resumes; nothing you already approved is affected.
      </span>
    </div>
  );
}
