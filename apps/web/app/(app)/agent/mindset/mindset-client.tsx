'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Toast, ToastProvider, ToastTitle, ToastViewport } from '@deucex/ui';
import {
  getInsightByDate,
  getMindsetBoundaries,
  listCheckIns,
  listNotes,
  listPatterns,
  listRecentInsights,
  type Insight,
  type MindsetBoundaries,
  type Note,
  type NoteMood,
  type Pattern,
} from '@deucex/db';
import { createClient } from '@/lib/supabase/client';
import { CheckInCard } from '@/components/mindset/check-in-card';
import { TodayCard } from '@/components/mindset/today-card';
import { SomeoneToCallCard } from '@/components/mindset/someone-to-call-card';
import { BoundariesCard } from '@/components/mindset/boundaries-card';
import { MoodChart } from '@/components/mindset/mood-chart';
import { PatternsCard } from '@/components/mindset/patterns-card';
import { RecentMorningsCard } from '@/components/mindset/recent-mornings-card';

export interface MindsetClientProps {
  playerId: string;
  timezone: string;
  lang: string;
  isFree: boolean;
  started: boolean;
}

function localDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

export function MindsetClient({ playerId, timezone, isFree, started }: MindsetClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => localDate(timezone), [timezone]);

  const [todayInsight, setTodayInsight] = useState<Insight | null>(null);
  const [recentInsights, setRecentInsights] = useState<Insight[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [boundaries, setBoundaries] = useState<MindsetBoundaries | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [checkins, setCheckins] = useState<{ date: string; value: number }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<{ title: string } | null>(null);
  const [toastOpen, setToastOpen] = useState(false);

  const showToast = useCallback((title: string) => {
    setToast({ title });
    setToastOpen(true);
  }, []);

  const load = useCallback(async () => {
    const [insight, recent, patternRows, boundaryRow, noteRows, checkinRows] = await Promise.all([
      getInsightByDate(supabase, today),
      listRecentInsights(supabase),
      listPatterns(supabase),
      getMindsetBoundaries(supabase, playerId),
      listNotes(supabase, { sinceDays: 90 }),
      listCheckIns(supabase, 90),
    ]);
    setTodayInsight(insight);
    setRecentInsights(recent);
    setPatterns(patternRows);
    setBoundaries(boundaryRow);
    setNotes(noteRows);
    setCheckins(checkinRows.map((c) => ({ date: c.date, value: c.value })));
    setLoaded(true);
  }, [supabase, playerId, today]);

  useEffect(() => {
    void load();
  }, [load]);

  const distress = todayInsight?.delivery === 'distress';

  return (
    <ToastProvider>
      <header className="flex flex-col gap-2 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mindset Coach</h1>
          <p className="text-sm text-muted-foreground">
            One insight a morning, drawn from what you said after matches. Specific, warm, and never
            a lecture. It&apos;s a coach, not a therapist, and it says so.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            title="Reads your last 30 days of notes and check-ins, your ranking line and the next two weeks of schedule. Writes two or three sentences. Nothing else."
          >
            Drafting model · 06:00 your time
          </Badge>
        </div>
      </header>

      {!loaded ? null : distress ? (
        <SomeoneToCallCard />
      ) : (
        <>
          <section className="grid grid-cols-[1fr_320px] items-start gap-4 max-[900px]:grid-cols-1">
            <TodayCard insight={todayInsight} started={started} onToast={showToast} />
            <div className="flex flex-col gap-4">
              <CheckInCard
                playerId={playerId}
                timezone={timezone}
                source="mindset"
                onToast={showToast}
              />
              {boundaries && (
                <BoundariesCard
                  playerId={playerId}
                  localDate={today}
                  boundaries={boundaries}
                  locked={isFree}
                  onToast={showToast}
                />
              )}
              {isFree && (
                <div className="rounded-lg bg-secondary/50 p-3.5 text-center text-sm">
                  <p className="mb-2 text-muted-foreground">
                    Patterns, the mood chart, boundaries and recent mornings are part of Pro.
                  </p>
                  <Button size="sm" onClick={() => showToast('Pro trial — coming soon')}>
                    Start Pro trial
                  </Button>
                </div>
              )}
            </div>
          </section>

          <div className="mt-4">
            <MoodChart
              notes={notes.map((n) => ({
                recordedAt: n.recorded_at,
                mood: n.mood as NoteMood | null,
                result: n.result,
              }))}
              checkins={checkins}
              timezone={timezone}
              locked={isFree}
            />
          </div>

          <section className="mt-4 grid grid-cols-2 items-start gap-4 max-[900px]:grid-cols-1">
            <PatternsCard patterns={patterns} locked={isFree} onToast={showToast} />
            <RecentMorningsCard insights={recentInsights} locked={isFree} />
          </section>
        </>
      )}

      {!distress && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link href="/match-scribe" className="underline">
            Read the notes it used
          </Link>
        </p>
      )}

      {toast && (
        <Toast open={toastOpen} onOpenChange={setToastOpen}>
          <ToastTitle className="font-medium">{toast.title}</ToastTitle>
        </Toast>
      )}
      <ToastViewport />
    </ToastProvider>
  );
}
