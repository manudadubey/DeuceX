'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@deucex/ui';
import { getSavedNotesThisMonth } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';
import { uploadNote } from '@/lib/match-scribe/api';
import { drainOfflineQueue, queuedNoteCount } from '@/lib/match-scribe/offline-queue';
import { RecorderCard } from '@/components/match-scribe/recorder-card';
import { DailyCheckInCard } from '@/components/match-scribe/daily-checkin-card';
import { HistorySection } from '@/components/match-scribe/history-section';
import { PipelineCard } from '@/components/match-scribe/pipeline-card';
import { PausedNotice } from '@/components/agents/paused-notice';

const TRANSCRIPTION = ['transcription'] as const;

export interface MatchScribeClientProps {
  playerId: string;
  timezone: string;
  isFree: boolean;
  autoStart: boolean;
}

export function MatchScribeClient({
  playerId,
  timezone,
  isFree,
  autoStart,
}: MatchScribeClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [quotaUsed, setQuotaUsed] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pipelineKey, setPipelineKey] = useState(0);
  const [totals, setTotals] = useState<{ count: number; since: string | null } | null>(null);
  const [toast, setToast] = useState<{ title: string; description?: string } | null>(null);
  const [toastOpen, setToastOpen] = useState(false);

  const showToast = useCallback((title: string, description?: string) => {
    setToast(description ? { title, description } : { title });
    setToastOpen(true);
  }, []);

  const refreshQuota = useCallback(async () => {
    setQuotaUsed(await getSavedNotesThisMonth(supabase));
  }, [supabase]);

  // Header badge: every saved note, and the month of the first one.
  const refreshTotals = useCallback(async () => {
    const [{ count }, { data: first }] = await Promise.all([
      supabase.from('notes').select('id', { count: 'exact', head: true }).eq('status', 'saved'),
      supabase
        .from('notes')
        .select('recorded_at')
        .eq('status', 'saved')
        .order('recorded_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    setTotals({ count: count ?? 0, since: first?.recorded_at ?? null });
  }, [supabase]);

  const refreshQueue = useCallback(async () => {
    setQueuedCount(await queuedNoteCount());
  }, []);

  useEffect(() => {
    void refreshQuota();
    void refreshQueue();
    void refreshTotals();
  }, [refreshQuota, refreshQueue, refreshTotals]);

  // S-18, S-AC-12: "when signal returns the note uploads and transcribes
  // without a further tap" — drained on mount (covers a page reload after
  // reconnecting) and on the browser's own `online` event.
  const drain = useCallback(async () => {
    const { uploaded } = await drainOfflineQueue(async (note) => {
      await uploadNote(supabase, {
        ctx: note.ctx,
        recordedAt: note.recordedAt,
        durSeconds: note.durSeconds,
        audio: note.audio,
        audioContentType: note.audioContentType,
        ...(note.languagePreference ? { languagePreference: note.languagePreference } : {}),
        ...(note.device ? { device: note.device } : {}),
      });
    });
    if (uploaded > 0) {
      showToast(uploaded === 1 ? 'Note uploaded' : `${uploaded} notes uploaded`);
      setRefreshKey((k) => k + 1);
    }
    void refreshQueue();
  }, [refreshQueue, showToast, supabase]);

  useEffect(() => {
    void drain();
    // One named handler, so cleanup removes the same listener it added (an
    // inline arrow here leaked a listener, and a duplicate upload, per render).
    const onOnline = () => void drain();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [drain]);

  const handleSaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setPipelineKey((k) => k + 1);
    void refreshQuota();
    void refreshTotals();
  }, [refreshQuota, refreshTotals]);

  const handleChanged = useCallback(() => setPipelineKey((k) => k + 1), []);

  return (
    <ToastProvider>
      <header className="flex flex-col gap-2 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Match Scribe</h1>
          <p className="text-sm text-muted-foreground">
            Sixty seconds after a match, a practice or a long day. Talk like you would to a coach in
            the car. Every agent reads this.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {totals && totals.count > 0 && (
            <Badge variant="secondary" className="font-mono">
              {totals.count} {totals.count === 1 ? 'note' : 'notes'}
              {totals.since
                ? ` since ${new Date(totals.since).toLocaleDateString('en-AU', { month: 'long' })}`
                : ''}
            </Badge>
          )}
          <Badge title="Sixty seconds of voice, transcribed usually within twenty seconds. Every agent reads the transcript; the audio is deleted once you save the note, or after 7 days at the latest.">
            Audio deleted after 7 days · transcripts kept
          </Badge>
        </div>
      </header>
      <PausedNotice providers={TRANSCRIPTION} label="Transcription" />

      {queuedCount > 0 && (
        <div className="mb-4 rounded-lg bg-secondary px-3.5 py-2.5 text-[0.8125rem]" role="status">
          Waiting for signal · {queuedCount} {queuedCount === 1 ? 'note' : 'notes'}
        </div>
      )}

      <section className="grid grid-cols-[7fr_5fr] items-start gap-4 max-[1100px]:grid-cols-1">
        <RecorderCard
          playerId={playerId}
          isFree={isFree}
          quotaUsed={quotaUsed}
          autoStart={autoStart}
          onQueuedOffline={() => void refreshQueue()}
          onSaved={handleSaved}
          onChanged={handleChanged}
          onToast={showToast}
        />
        <div className="flex flex-col gap-4">
          <PipelineCard refreshKey={pipelineKey} />
          <DailyCheckInCard playerId={playerId} timezone={timezone} onToast={showToast} />
        </div>
      </section>

      <div className="mt-4">
        <HistorySection refreshKey={refreshKey} onToast={showToast} />
      </div>

      {toast && (
        <Toast open={toastOpen} onOpenChange={setToastOpen}>
          <ToastTitle className="font-medium">{toast.title}</ToastTitle>
          {toast.description && (
            <ToastDescription className="text-muted-foreground">
              {toast.description}
            </ToastDescription>
          )}
        </Toast>
      )}
      <ToastViewport />
    </ToastProvider>
  );
}
