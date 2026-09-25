'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle } from '@deucex/ui';
import { snoozeFinancialAction } from '@deucex/db';
import type { Milestone } from '@deucex/agents';
import { createClient } from '@/lib/supabase/client';
import type { FinancialAction } from '@/lib/financial/load';

function nextMonday7amUtc(now: Date): Date {
  const next = new Date(now);
  const daysUntilMonday = (8 - next.getUTCDay()) % 7 || 7;
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  next.setUTCHours(7, 0, 0, 0);
  return next;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// PRD-03 §4.1's "One thing to do this week" card (F-18), including its
// "Next milestone" progress bar (section 7's coverage-threshold math,
// packages/agents/src/financial/milestone.ts). The action text itself is
// read from the latest agent_runs row (financial-client.tsx's own snapshot
// load), never generated here — this component only renders it and handles
// Not this week (F-AC-10).
export function OneThingCard({
  playerId,
  action,
  milestone,
  currency,
  onToast,
  onSnoozed,
}: {
  playerId: string;
  action: FinancialAction | null;
  milestone: Milestone;
  currency: string;
  onToast: (title: string) => void;
  onSnoozed: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [snoozing, setSnoozing] = useState(false);

  const handleSnooze = async () => {
    if (!action) return;
    setSnoozing(true);
    try {
      const snoozedUntil = nextMonday7amUtc(new Date());
      await snoozeFinancialAction(supabase, {
        playerId,
        candidateKey: action.candidateKey,
        snoozedUntil: snoozedUntil.toISOString(),
      });
      onToast('Snoozed until Monday 07:00');
      onSnoozed();
    } finally {
      setSnoozing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>One thing to do this week</CardTitle>
          {action && <Badge variant="secondary">07:00 your time</Badge>}
        </div>
        {!action && (
          <CardDescription>
            Runs tomorrow at 07:00 your time once there is enough to go on.
          </CardDescription>
        )}
      </CardHeader>
      {action && (
        <div className="flex flex-col gap-2 px-6">
          <p className="text-sm font-medium">{action.text}</p>
          {action.secondSentence && (
            <p className="text-sm text-muted-foreground">{action.secondSentence}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Adds about {action.effectWeeks.toFixed(1)} weeks of runway.
          </p>
          <div>
            <Button size="sm" variant="ghost" disabled={snoozing} onClick={handleSnooze}>
              Not this week
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5 border-t border-border px-6 pt-3 pb-1">
        <p className="text-xs font-medium text-muted-foreground">
          Next milestone · MRR covers {Math.round(milestone.target * 100)}% of spend
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.round(milestone.progress * 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {Math.round(milestone.current * 100)}% today ·{' '}
          {formatMoney(milestone.neededWeeklyIncome, currency)}
          /wk needed
          {milestone.eta ? ` · at current growth: ${milestone.eta}` : ''}
        </p>
      </div>
    </Card>
  );
}
