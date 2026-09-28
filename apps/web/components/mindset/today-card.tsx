'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';
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
  cn,
} from '@deucex/ui';
import { setInsightFeedback, setInsightFocusDone, type Insight } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', {
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

// PRD-06 §4.1's Today card, styled as the prototype's `.today`, `.focus-row`
// and `.fb`: the date, provenance, the insight, the focus as a checkbox row,
// and Was this useful? with "Read the notes it used".
export function TodayCard({
  insight,
  started,
  recent,
  pausedUntil,
  deliveryHour,
  timezone,
  onToast,
}: {
  insight: Insight | null;
  started: boolean;
  /** Earlier insights, newest first, for "Done · N of the last 5" (MC-12). */
  recent: Insight[];
  /** Local date the pause runs to, when paused (MC-15). */
  pausedUntil: string | null;
  deliveryHour: number;
  timezone: string;
  onToast: (title: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [current, setCurrent] = useState(insight);
  useEffect(() => setCurrent(insight), [insight]);

  if (!started) {
    return (
      <Card>
        <Empty title="Record three notes and the coach starts reading">
          It needs something to read first. Until then, the daily check-in is enough.
        </Empty>
      </Card>
    );
  }

  if (!current) {
    const localHour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      }).format(new Date()),
    );
    // Only claim a failure once the run should have happened.
    const [title, description] = pausedUntil
      ? [
          'Paused',
          `No insights until ${formatDate(pausedUntil)}. Resume any time under Your boundaries.`,
        ]
      : localHour < deliveryHour + 1
        ? [
            `Your insight arrives at ${String(deliveryHour).padStart(2, '0')}:00`,
            'It reads your last 30 days of notes and check-ins first.',
          ]
        : [
            "This morning's run didn't complete",
            'Nothing to show yet. It usually catches up within the hour.',
          ];
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
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

  if (current.delivery !== 'delivered') {
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
  const lastFive = [current, ...recent.filter((i) => i.id !== current.id)]
    .filter((i) => i.delivery === 'delivered' && i.focus)
    .slice(0, 5);
  const doneCount = lastFive.filter((i) => (i.id === current.id ? focusDone : i.focus_done)).length;

  const handleFocusToggle = async () => {
    const next = !focusDone;
    try {
      setCurrent(await setInsightFocusDone(supabase, current.id, next));
      if (next) onToast("Nice. Logged for tomorrow's insight.");
    } catch {
      onToast("Couldn't save that. Try again.");
    }
  };

  const handleFeedback = async (feedback: 'yes' | 'not_today') => {
    try {
      setCurrent(await setInsightFeedback(supabase, current.id, feedback));
      onToast(
        feedback === 'yes'
          ? 'Thanks · more like this'
          : 'Noted · the coach will change tack tomorrow',
      );
    } catch {
      onToast("Couldn't save that. Try again.");
    }
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

      <div className="flex max-w-[62ch] flex-col gap-3 px-6 text-[1.0625rem] leading-relaxed">
        {body.map((sentence, i) => (
          <p key={i}>{sentence}</p>
        ))}
      </div>

      {current.focus && (
        <button
          type="button"
          role="checkbox"
          aria-checked={focusDone}
          onClick={() => void handleFocusToggle()}
          className="mx-6 grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl bg-surface px-4 py-3.5 text-left shadow-[0_0_0_1px_var(--border)]"
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid size-[1.375rem] place-items-center rounded-md border border-input bg-field',
              focusDone && 'border-primary bg-primary text-primary-foreground',
            )}
          >
            {focusDone && <Check className="size-3.5 stroke-[2.5]" />}
          </span>
          <span>
            <span className="block text-[0.6875rem] font-medium tracking-[.06em] text-muted-foreground uppercase">
              Today&apos;s focus
            </span>
            <span
              className={cn(
                'mt-0.5 block text-[0.9375rem] font-medium',
                focusDone && 'text-muted-foreground line-through',
              )}
            >
              {current.focus}
            </span>
          </span>
          <Badge variant={focusDone ? 'ok' : 'secondary'} className="tabular-nums">
            {focusDone ? `Done · ${doneCount} of the last ${lastFive.length}` : 'Tap when done'}
          </Badge>
        </button>
      )}

      <CardFooter className="flex-wrap gap-2 text-[0.8125rem] text-muted-foreground">
        <span>Was this useful?</span>
        <Button
          size="sm"
          variant={current.feedback === 'yes' ? 'secondary' : 'outline'}
          aria-pressed={current.feedback === 'yes'}
          onClick={() => void handleFeedback('yes')}
        >
          Yes
        </Button>
        <Button
          size="sm"
          variant={current.feedback === 'not_today' ? 'secondary' : 'outline'}
          aria-pressed={current.feedback === 'not_today'}
          onClick={() => void handleFeedback('not_today')}
        >
          Not today
        </Button>
        <Link
          href="/match-scribe"
          className="ml-auto inline-flex items-center gap-1 font-medium text-foreground no-underline hover:underline"
        >
          Read the notes it used
          <ChevronRight aria-hidden="true" className="size-3.5" />
        </Link>
      </CardFooter>
    </Card>
  );
}
