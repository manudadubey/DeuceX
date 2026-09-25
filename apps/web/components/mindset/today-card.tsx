'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
} from '@deucex/ui';
import { setInsightFeedback, setInsightFocusDone, type Insight } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatProvenance(insight: Insight): string {
  const p = insight.provenance as {
    notes?: number;
    checkins?: number;
    rankingDelta?: number | null;
    nextEvent?: string | null;
    daysToEvent?: number | null;
  } | null;
  if (!p) return '';
  const notesPart = `${p.notes ?? 0} ${p.notes === 1 ? 'note' : 'notes'}`;
  const checkinsPart = `${p.checkins ?? 0} ${p.checkins === 1 ? 'check-in' : 'check-ins'}`;
  const parts = [`From ${notesPart}`, checkinsPart];
  if (p.nextEvent && p.daysToEvent != null) {
    parts.push(`${p.nextEvent} in ${p.daysToEvent} days`);
  }
  return `${parts.join(', ')}.`;
}

// PRD-06 §4.1's Today card: date, provenance line, an optional pattern-flag
// badge, the insight body, the focus row, and the Yes / Not today pair.
// Quiet/withheld/distress mornings and the pre-third-note empty state are
// handled by the caller (mindset-client.tsx) rather than branched on here,
// since each has its own quite different copy and, for distress, an
// entirely different card (someone-to-call-card.tsx).
export function TodayCard({
  insight,
  started,
  onToast,
}: {
  insight: Insight | null;
  started: boolean;
  onToast: (title: string) => void;
}) {
  const supabase = createClient();
  const [current, setCurrent] = useState(insight);

  if (!started) {
    return (
      <Card>
        <Empty title="Record three notes and the coach starts reading">
          It needs something to read first.
        </Empty>
      </Card>
    );
  }

  if (!current) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This morning&apos;s run didn&apos;t complete</CardTitle>
          <CardDescription>
            Nothing to show yet. It usually catches up within the hour.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (current.delivery === 'quiet') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{formatDate(current.date)}</CardTitle>
        </CardHeader>
        <div className="px-6 text-sm text-muted-foreground">
          Match day. The coach is quiet until your evening note.
        </div>
      </Card>
    );
  }

  if (current.delivery === 'withheld' || current.delivery === 'failed') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{formatDate(current.date)}</CardTitle>
        </CardHeader>
        <div className="px-6 text-sm text-muted-foreground">
          Nothing from the coach this morning. Your notes are still being read.
        </div>
      </Card>
    );
  }

  const body = Array.isArray(current.body) ? (current.body as string[]) : [];
  const focusDone = current.focus_done;

  const handleFocusToggle = async () => {
    const next = !focusDone;
    const updated = await setInsightFocusDone(supabase, current.id, next);
    setCurrent(updated);
    if (next) onToast("Nice. Logged for tomorrow's insight.");
  };

  const handleFeedback = async (feedback: 'yes' | 'not_today') => {
    const updated = await setInsightFeedback(supabase, current.id, feedback);
    setCurrent(updated);
    onToast(
      feedback === 'yes'
        ? 'Thanks · more like this'
        : 'Noted · the coach will change tack tomorrow',
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{formatDate(current.date)}</CardTitle>
        <CardDescription>{formatProvenance(current)}</CardDescription>
        {current.pattern_flag && (
          <CardActions>
            <Badge variant="secondary">Pattern flag</Badge>
          </CardActions>
        )}
      </CardHeader>

      <div className="flex flex-col gap-3 px-6 text-sm">
        {body.map((sentence, i) => (
          <p key={i}>{sentence}</p>
        ))}
      </div>

      {current.focus && (
        <div className="mx-6 flex items-center gap-3 rounded-lg bg-secondary/50 p-3.5">
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Today&apos;s focus</div>
            <div className="text-sm">{current.focus}</div>
          </div>
          <Button
            size="sm"
            variant={focusDone ? 'secondary' : 'outline'}
            onClick={handleFocusToggle}
          >
            {focusDone ? 'Done' : 'Tap when done'}
          </Button>
        </div>
      )}

      <CardFooter>
        <span className="text-sm text-muted-foreground">Was this useful?</span>
        <Button size="sm" variant="outline" onClick={() => handleFeedback('yes')}>
          Yes
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleFeedback('not_today')}>
          Not today
        </Button>
      </CardFooter>
    </Card>
  );
}
