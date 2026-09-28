'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Badge, Card, CardDescription, CardHeader, CardTitle, cn } from '@deucex/ui';
import { createClient } from '@/lib/supabase/client';
import {
  pipelineSteps,
  type PipelineContentDraft,
  type PipelineInsight,
  type PipelineNote,
  type StepState,
} from '@/lib/match-scribe/pipeline';

const REFRESH_MS = 20_000;

const CTX_LABEL: Record<string, string> = {
  match: 'Match',
  practice: 'Practice',
  travel: 'Travel',
  other: 'Note',
};

const BADGE: Record<StepState, 'ok' | 'lime' | 'secondary' | 'warn'> = {
  done: 'ok',
  now: 'lime',
  next: 'secondary',
  failed: 'warn',
};

type LatestNote = PipelineNote & {
  id: string;
  recorded_at: string;
  opponent: string | null;
};

function latestLine(note: LatestNote): string {
  const when = new Date(note.recorded_at).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const what =
    note.ctx === 'match' && note.opponent
      ? `Match vs ${note.opponent.replace(/^vs\.?\s*/i, '')}`
      : (CTX_LABEL[note.ctx] ?? 'Note');
  return `Latest: ${when} · ${what}`;
}

// `#steps` (PRD-02 section 4.3, S-19): the latest note's real progress
// through transcription, reading and the two agents that consume it.
export function PipelineCard({ refreshKey }: { refreshKey: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [note, setNote] = useState<LatestNote | null>(null);
  const [content, setContent] = useState<PipelineContentDraft | null>(null);
  const [insight, setInsight] = useState<PipelineInsight | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data: latest } = await supabase
      .from('notes')
      .select(
        'id, status, ctx, recorded_at, opponent, audio_uploaded_at, transcript_confirmed_at, lang, mood, extraction',
      )
      .neq('status', 'deleted')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setNote(latest ?? null);

    if (latest) {
      const [{ data: draft }, { data: delivered }] = await Promise.all([
        supabase
          .from('patron_updates')
          .select('status, subject')
          .eq('note_id', latest.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('insights')
          .select('date, pattern_flag')
          .eq('delivery', 'delivered')
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setContent(draft ?? null);
      setInsight(delivered ?? null);
    }
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, refreshKey]);

  const steps = note ? pipelineSteps(note, content, insight) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>What happens to your note</CardTitle>
        <CardDescription>
          {note ? latestLine(note) : loaded ? 'Your first note shows up here.' : ' '}
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-1.5 px-6">
        {!note && loaded && (
          <p className="text-[0.8125rem] text-muted-foreground">
            Record a note and follow it here: transcribed, read for a result and mood, then used by
            the Mindset Coach and the Content Agent.
          </p>
        )}
        {steps.map((step, i) => {
          const body = (
            <>
              <span
                className={cn(
                  'row-span-2 grid size-7 place-items-center rounded-full text-xs font-medium',
                  step.state === 'done' && 'bg-chart-2 text-[oklch(0.2_0.05_131)]',
                  step.state === 'now' && 'bg-foreground text-background',
                  step.state === 'failed' && 'bg-warn-bg text-warn',
                  step.state === 'next' && 'bg-muted text-muted-foreground',
                )}
              >
                {step.state === 'done' ? <Check aria-hidden="true" className="size-3.5" /> : i + 1}
              </span>
              <span className="text-sm font-medium">{step.title}</span>
              <Badge variant={BADGE[step.state]} className="col-start-3 row-span-2 row-start-1">
                {step.badge}
              </Badge>
              <span className="col-start-2 text-xs text-muted-foreground">{step.detail}</span>
            </>
          );
          const className =
            'grid grid-cols-[1.75rem_1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-lg bg-secondary/50 px-3 py-2.5 no-underline text-foreground';
          return step.href ? (
            <Link key={step.key} href={step.href} className={cn(className, 'hover:bg-secondary')}>
              {body}
            </Link>
          ) : (
            <div key={step.key} className={className}>
              {body}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
