import { Badge, Card, CardDescription, CardHeader, CardTitle, Empty } from '@deucex/ui';
import type { Insight } from '@deucex/db';

function statusBadge(insight: Insight): { label: string; variant: 'ok' | 'secondary' } {
  if (insight.delivery === 'quiet') return { label: 'Quiet', variant: 'secondary' };
  if (insight.delivery === 'withheld' || insight.delivery === 'failed') {
    return { label: 'Skipped', variant: 'secondary' };
  }
  return {
    label: insight.focus_done ? 'Done' : 'Skipped',
    variant: insight.focus_done ? 'ok' : 'secondary',
  };
}

function firstLine(insight: Insight): string {
  if (insight.delivery === 'quiet') return 'Match day, stayed quiet';
  if (insight.delivery === 'withheld' || insight.delivery === 'failed') {
    return 'Nothing from the coach that morning';
  }
  const body = Array.isArray(insight.body) ? (insight.body as string[]) : [];
  return body[0] ?? '';
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
  });
}

// MC-21: the last 14 mornings, first line, focus and status.
export function RecentMorningsCard({ insights, locked }: { insights: Insight[]; locked: boolean }) {
  return (
    <Card className={locked ? 'opacity-50' : undefined}>
      <CardHeader>
        <CardTitle>Recent mornings</CardTitle>
        <CardDescription>What it said, and whether the focus got done.</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-1 px-6">
        {insights.length === 0 ? (
          <Empty title="Nothing yet" />
        ) : (
          insights.map((insight) => {
            const status = statusBadge(insight);
            return (
              <div
                key={insight.id}
                className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-b-0"
              >
                <div>
                  <div className="text-sm">
                    {formatDay(insight.date)} · {firstLine(insight)}
                  </div>
                  {insight.focus && (
                    <div className="text-[0.8125rem] text-muted-foreground">{insight.focus}</div>
                  )}
                </div>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
