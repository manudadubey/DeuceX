import { Badge, Card, CardDescription, CardHeader, CardTitle, Empty } from '@deucex/ui';
import type { Insight } from '@deucex/db';

function statusBadge(
  insight: Insight,
  today: string,
): { label: string; variant: 'ok' | 'secondary' | 'lime' } {
  if (insight.delivery === 'quiet') return { label: 'Quiet', variant: 'secondary' };
  if (insight.delivery !== 'delivered') return { label: 'No insight', variant: 'secondary' };
  // Today's focus isn't skipped yet: the day isn't over.
  if (!insight.focus_done && insight.date === today) return { label: 'Today', variant: 'lime' };
  if (!insight.focus) return { label: 'Read', variant: 'secondary' };
  return {
    label: insight.focus_done ? 'Done' : 'Skipped',
    variant: insight.focus_done ? 'ok' : 'secondary',
  };
}

function firstLine(insight: Insight): string {
  if (insight.delivery === 'quiet') return 'Match day, stayed quiet';
  if (insight.delivery === 'distress') return 'The coach stepped back and pointed to people';
  if (insight.delivery !== 'delivered') return 'Nothing from the coach that morning';
  const body = Array.isArray(insight.body) ? (insight.body as string[]) : [];
  return body[0] ?? '';
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
  });
}

// MC-21: the last 14 mornings, first line, focus and status.
export function RecentMorningsCard({
  insights,
  today,
  locked,
}: {
  insights: Insight[];
  today: string;
  locked: boolean;
}) {
  return (
    <Card
      className={locked ? 'pointer-events-none opacity-50 select-none' : undefined}
      aria-disabled={locked || undefined}
    >
      <CardHeader>
        <CardTitle>Recent mornings</CardTitle>
        <CardDescription>What it said, and whether the focus got done.</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-1 px-6">
        {insights.length === 0 ? (
          <Empty title="Nothing yet" />
        ) : (
          insights.map((insight) => {
            const status = statusBadge(insight, today);
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
