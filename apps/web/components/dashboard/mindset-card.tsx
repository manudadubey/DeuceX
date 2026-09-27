'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Brain, Target } from 'lucide-react';
import { Badge, Card, Progress, cn } from '@deucex/ui';
import { getInsightByDate, listCheckIns, saveCheckIn, type Insight } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';
import { AgentHeader } from './agent-header';

const STARTS_AFTER_NOTES = 3;
const VALUES = [1, 2, 3, 4, 5] as const;

// The prototype's dashboard Mindset Coach card (docs/deucex-dashboard.html):
// before the third note, progress toward it and the check-in; after, this
// morning's insight and focus above the check-in. A tap on a number saves
// the day's check-in at once (MC-5, source 'dashboard'), keeping any
// sentence already written today on the Mindset page or in Match Scribe.
export function MindsetCard({
  playerId,
  timezone,
  notesCount,
}: {
  playerId: string;
  timezone: string;
  notesCount: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const localDate = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()),
    [timezone],
  );
  const started = notesCount >= STARTS_AFTER_NOTES;
  const [insight, setInsight] = useState<Insight | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [sentence, setSentence] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listCheckIns(supabase, 1).then((rows) => {
      const today = rows.find((r) => r.date === localDate);
      if (!cancelled && today) {
        setValue(today.value);
        setSentence(today.sentence);
      }
    });
    if (started) {
      void getInsightByDate(supabase, localDate).then((row) => {
        if (!cancelled) setInsight(row);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [supabase, localDate, started]);

  const handlePick = async (next: (typeof VALUES)[number]) => {
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      await saveCheckIn(supabase, {
        playerId,
        date: localDate,
        value: next,
        sentence,
        source: 'dashboard',
      });
    } catch {
      setValue(previous);
    } finally {
      setSaving(false);
    }
  };

  const delivered = insight?.delivery === 'delivered';
  const body = delivered && Array.isArray(insight.body) ? (insight.body as string[]) : [];
  const time = insight
    ? new Intl.DateTimeFormat('en-AU', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: timezone,
      }).format(new Date(insight.created_at))
    : null;

  return (
    <Card className="self-stretch">
      <AgentHeader
        icon={<Brain />}
        title="Mindset Coach"
        sub={started ? (time ? `Today · ${time}` : 'Today') : 'Starts after three notes'}
        badge={
          !started ? (
            <Badge variant="secondary" className="tabular-nums">
              {notesCount} of {STARTS_AFTER_NOTES}
            </Badge>
          ) : insight?.pattern_flag ? (
            <Badge variant="secondary">Pattern</Badge>
          ) : null
        }
      />

      {!started ? (
        <div className="flex flex-col gap-3 px-6 max-sm:px-5">
          <Progress value={(notesCount / STARTS_AFTER_NOTES) * 100} />
          <p className="text-sm text-muted-foreground">
            It needs something to read before it says anything. Until then, the daily check-in is
            enough.
          </p>
        </div>
      ) : delivered && body.length > 0 ? (
        <div className="flex flex-col gap-3 px-6 max-sm:px-5">
          <p className="text-[0.9375rem] leading-relaxed">{body[0]}</p>
          {insight.focus ? (
            <div className="flex gap-2.5 rounded-lg bg-muted/50 p-3 text-sm shadow-[0_0_0_1px_var(--border)]">
              <Target aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ok" />
              <span>
                <b className="font-medium">Today&apos;s focus:</b> {insight.focus}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="px-6 text-sm text-muted-foreground max-sm:px-5">
          {insight?.delivery === 'quiet'
            ? 'Match day. The coach is quiet until your evening note.'
            : insight
              ? 'Nothing from the coach this morning. Your notes are still being read.'
              : "This morning's insight arrives after the 07:00 run."}{' '}
          <Link href="/agent/mindset" className="font-medium text-foreground underline">
            Open Mindset Coach
          </Link>
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 px-6 max-sm:px-5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{started ? 'Mood check-in' : 'Check in'}</span>
          <span>1 flat · 5 energised</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="This morning's mood">
          {VALUES.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={value === n}
              disabled={saving}
              onClick={() => void handlePick(n)}
              className={cn(
                'h-9 rounded-md border border-input bg-background text-sm font-medium tabular-nums transition-colors hover:bg-accent max-[900px]:h-11',
                value === n && 'border-primary bg-primary text-primary-foreground hover:bg-primary',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
