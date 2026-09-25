'use client';

import { useState } from 'react';
import {
  Badge,
  Card,
  CardActions,
  CardDescription,
  CardHeader,
  CardTitle,
  ToggleGroup,
  ToggleGroupItem,
} from '@deucex/ui';
import type { HistoryRow } from '@/lib/content/api';

// PRD-05 C-16 / section 4.1 "Past updates": date order, newest first, with
// open rates from Resend and joins within seven days. A missing value shows
// an en dash, never a number (section 4.1, register B17).

type Filter = 'all' | 'published' | 'skipped';

const STATUS: Record<string, { label: string; variant: 'ok' | 'secondary' | 'danger' | 'lime' }> = {
  published: { label: 'Published', variant: 'ok' },
  skipped: { label: 'Skipped', variant: 'secondary' },
  scheduled: { label: 'Scheduled', variant: 'lime' },
  send_failed: { label: 'Send failed', variant: 'danger' },
};

export function HistoryCard({ rows, timezone }: { rows: HistoryRow[]; timezone: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const shown = rows.filter((r) => filter === 'all' || r.status === filter);
  const fmt = new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  });

  return (
    <Card className="gap-4 p-6">
      <CardHeader className="p-0">
        <CardTitle>Past updates</CardTitle>
        <CardDescription>
          Open rates from Resend. Joins are new patrons within seven days of sending.
        </CardDescription>
        <CardActions>
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && setFilter(v as Filter)}
            aria-label="Filter updates"
          >
            <ToggleGroupItem value="all" size="sm">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="published" size="sm">
              Published
            </ToggleGroupItem>
            <ToggleGroupItem value="skipped" size="sm">
              Skipped
            </ToggleGroupItem>
          </ToggleGroup>
        </CardActions>
      </CardHeader>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? 'Nothing sent or skipped yet. Your first update will show here.'
            : 'Nothing in this filter.'}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {shown.map((r) => {
            const s = STATUS[r.status] ?? STATUS.published!;
            return (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-1 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {r.subject}
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
                <div className="row-span-2 text-right">
                  <div className="font-mono text-sm tabular-nums">
                    {r.openRate === null ? '–' : `${r.openRate}%`}
                  </div>
                  <div className="text-[0.75rem] text-muted-foreground">opened</div>
                </div>
                <div className="row-span-2 text-right">
                  <div className="font-mono text-sm tabular-nums">
                    {r.joins7d === null ? '–' : r.joins7d > 0 ? `+${r.joins7d}` : '0'}
                  </div>
                  <div className="text-[0.75rem] text-muted-foreground">joins in 7d</div>
                </div>
                <div className="text-[0.8125rem] text-muted-foreground">
                  {fmt.format(new Date(r.date))} · {r.tiers} · {r.words} words
                  {r.status === 'published' && r.deliveredCount !== null
                    ? ` · ${r.deliveredCount} delivered`
                    : ''}
                  {r.skipReason ? ` · You skipped it: "${r.skipReason}"` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
