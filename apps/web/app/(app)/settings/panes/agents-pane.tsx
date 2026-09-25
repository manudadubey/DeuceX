'use client';

import { useState } from 'react';
import { Badge, Card, CardHeader, CardTitle, Switch } from '@deucex/ui';
import { setAgentPaused, type Database } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';

type AgentSchedule = Database['public']['Tables']['agent_schedules']['Row'];

// PRD-12 §4.6, ST-11/ST-12. Cadence copy deliberately never names a model
// (M-... "No model provider names in the interface," TECH-ARCHITECTURE.md
// section 5's own generic "structured-output" labelling). Tournament and
// Content aren't built yet (steps 3.2/4.2) — shown, not hidden, with a
// plain "arrives later" note rather than a working switch, the same
// honesty this pane already owes Equipment and Connections. Sponsor/Fan are
// Elite-only previews (M-TIER-4), always shown dimmed.
const BUILT_AGENTS = [
  { key: 'mindset', label: 'Mindset Coach', cadence: 'Structured-output model · daily' },
  { key: 'financial', label: 'Financial Agent', cadence: 'Structured-output model · daily' },
] as const;

const UNBUILT_AGENTS = [
  { key: 'tournament', label: 'Tournament Agent', arrives: 'step 3.2' },
  { key: 'content', label: 'Content Agent', arrives: 'step 4.2' },
] as const;

const ELITE_AGENTS = [
  { key: 'sponsor', label: 'Sponsor Agent' },
  { key: 'fans', label: 'Fan Agent' },
] as const;

export function AgentsPane({
  playerId,
  agentSchedules,
  onAgentSchedulesChange,
  onToast,
}: {
  playerId: string;
  agentSchedules: AgentSchedule[];
  onAgentSchedulesChange: (rows: AgentSchedule[]) => void;
  onToast: (title: string) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);

  function isPaused(agentName: string): boolean {
    return agentSchedules.find((s) => s.agent_name === agentName)?.paused ?? false;
  }

  async function handleToggle(agentName: string, paused: boolean) {
    setPending(agentName);
    try {
      const supabase = createClient();
      await setAgentPaused(supabase, playerId, agentName, paused);
      const next = paused
        ? [
            ...agentSchedules.filter((s) => s.agent_name !== agentName),
            {
              player_id: playerId,
              agent_name: agentName,
              paused: true,
              prompt_overrides: {},
              updated_at: new Date().toISOString(),
            },
          ]
        : agentSchedules.filter((s) => s.agent_name !== agentName);
      onAgentSchedulesChange(next);
      onToast(paused ? `${agentName} paused` : `${agentName} resumed`);
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="gap-6 p-6">
      <CardHeader className="p-0">
        <CardTitle>Agents</CardTitle>
      </CardHeader>

      <div className="flex flex-col gap-2">
        {BUILT_AGENTS.map((a) => (
          <div
            key={a.key}
            className="flex items-center gap-3.5 rounded-lg bg-secondary/50 px-4 py-3.5"
          >
            <div className="flex-1">
              <div className="font-medium">{a.label}</div>
              <div className="text-[0.8125rem] text-muted-foreground">{a.cadence}</div>
            </div>
            <Switch
              checked={!isPaused(a.key)}
              disabled={pending === a.key}
              onCheckedChange={(v) => handleToggle(a.key, !v)}
              aria-label={`${a.label} enabled`}
            />
          </div>
        ))}

        {UNBUILT_AGENTS.map((a) => (
          <div
            key={a.key}
            className="flex items-center gap-3.5 rounded-lg bg-secondary/30 px-4 py-3.5 opacity-70"
          >
            <div className="flex-1">
              <div className="font-medium">{a.label}</div>
              <div className="text-[0.8125rem] text-muted-foreground">Arrives with {a.arrives}</div>
            </div>
            <Switch checked={false} disabled aria-label={`${a.label} (not yet available)`} />
          </div>
        ))}

        {ELITE_AGENTS.map((a) => (
          <div
            key={a.key}
            className="flex items-center gap-3.5 rounded-lg bg-secondary/30 px-4 py-3.5 opacity-70"
          >
            <div className="flex-1 flex items-center gap-2">
              <span className="font-medium">{a.label}</span>
              <Badge variant="secondary">Elite</Badge>
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => onToast(`${a.label} preview — coming with Elite`)}
            >
              Preview
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Weekly budget, surfaces and blocked dates live on the Tournament Agent&apos;s own page.
      </p>
    </Card>
  );
}
