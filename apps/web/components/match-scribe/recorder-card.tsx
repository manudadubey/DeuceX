'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Progress,
  Spinner,
  Switch,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  cn,
  Input,
} from '@deucex/ui';
import {
  FREE_TIER_MONTHLY_NOTE_LIMIT,
  INITIAL_TAG_VOCABULARY,
  getNote,
  updateNoteContent,
  type Note,
  type NoteCtx,
  type NoteMood,
} from '@deucex/db';
import { isBandStamp, isStampChipAt } from '@deucex/agents';
import { createClient } from '@/lib/supabase/client';
import {
  QuotaExceededError,
  deleteNoteRemote,
  retryNoteRemote,
  saveNoteRemote,
  uploadNote,
} from '@/lib/match-scribe/api';
import { enqueueOfflineNote } from '@/lib/match-scribe/offline-queue';
import { announceScribeRecording, onScribeToggle } from '@/lib/match-scribe/recorder-bus';
import { RECORDING_CAP_SECONDS, useAudioRecorder } from './use-audio-recorder';
import { WaveformCanvas } from './waveform-canvas';
import { StartTrialButton } from '@/components/billing/start-trial-button';

const CONTEXTS: { value: NoteCtx; label: string }[] = [
  { value: 'match', label: 'Match' },
  { value: 'practice', label: 'Practice' },
  { value: 'travel', label: 'Travel' },
  { value: 'other', label: 'Other' },
];

const MOODS: { value: NoteMood; label: string; swatch: string }[] = [
  { value: 'frustrated', label: 'Frustrated', swatch: 'bg-warn' },
  { value: 'flat', label: 'Flat', swatch: 'bg-muted-foreground' },
  { value: 'confident', label: 'Confident', swatch: 'bg-ok' },
  { value: 'energised', label: 'Energised', swatch: 'bg-chart-2' },
];

type Phase = 'idle' | 'recording' | 'uploading' | 'transcribing' | 'review' | 'locked';

const POLL_INTERVAL_MS = 1500;
const STALL_AFTER_MS = 45_000;
// A note left mid-flow (a reload, a closed tab) is picked back up on arrival
// rather than stranded until the 7-day audio sweep (S-19: never lose the
// audio or typed text).
const RESUMABLE = [
  'transcribing',
  'uploaded',
  'review',
  'failed_transcription',
  'failed_extraction',
];

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export interface RecorderCardProps {
  playerId: string;
  /** Free tier: 10 notes a month and no coach share (PRD-02 section 2). */
  isFree: boolean;
  quotaUsed: number;
  autoStart?: boolean;
  onQueuedOffline: () => void;
  onSaved: () => void;
  /** Any change the pipeline card should reflect now rather than on its next refresh. */
  onChanged?: () => void;
  onToast: (title: string, description?: string) => void;
}

export function RecorderCard({
  isFree,
  quotaUsed,
  autoStart,
  onQueuedOffline,
  onSaved,
  onChanged,
  onToast,
}: RecorderCardProps) {
  const supabase = useMemo(() => createClient(), []);
  const [ctx, setCtx] = useState<NoteCtx>('match');
  // Read at stop time, not captured when recording started.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const atLimit = isFree && quotaUsed >= FREE_TIER_MONTHLY_NOTE_LIMIT;
  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState<Note | null>(null);
  const [transcript, setTranscript] = useState('');
  const [mood, setMood] = useState<NoteMood | null>(null);
  const [moodProposed, setMoodProposed] = useState(false);
  const [result, setResult] = useState('');
  const [opponent, setOpponent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [coachShare, setCoachShare] = useState(!isFree);
  const [saving, setSaving] = useState(false);
  const [lastDur, setLastDur] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  // The note being transcribed, before its row is loaded into review.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);

  // Locked only when idle: a note already in review can still be saved or
  // discarded (the server re-checks the quota on save).
  useEffect(() => {
    setPhase((p) => (p === 'idle' && atLimit ? 'locked' : p === 'locked' && !atLimit ? 'idle' : p));
  }, [atLimit]);

  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const loadIntoForm = useCallback(
    (row: Note) => {
      setNote(row);
      setCtx(row.ctx as NoteCtx);
      setLastDur(row.dur_seconds);
      setTranscript(row.transcript ?? '');
      setMood((row.mood as NoteMood | null) ?? null);
      setMoodProposed(Boolean(row.mood));
      setResult(row.result ?? '');
      setOpponent(row.opponent ?? '');
      setTags(Array.isArray(row.tags) ? (row.tags as string[]) : []);
      setCoachShare(isFree ? false : row.coach_share);
    },
    [isFree],
  );

  const pollForTranscript = useCallback(
    (noteId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        const row = await getNote(supabase, noteId);
        if (!row) return;
        if (
          row.status === 'review' ||
          row.status === 'failed_transcription' ||
          row.status === 'failed_extraction'
        ) {
          stopPolling();
          loadIntoForm(row);
          setPhase('review');
          onChanged?.();
        }
      }, POLL_INTERVAL_MS);
    },
    [loadIntoForm, onChanged, stopPolling, supabase],
  );

  useEffect(() => stopPolling, [stopPolling]);

  // PRD-02 section 3: transcription over 20 seconds is a failure the player can
  // act on. Give it 45 before offering Retry and Discard, so a slow but healthy
  // run isn't interrupted.
  useEffect(() => {
    setStalled(false);
    if (phase !== 'transcribing') return;
    const timer = setTimeout(() => setStalled(true), STALL_AFTER_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('notes')
        .select('*')
        .in('status', RESUMABLE)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data || autoStart) return;
      if (data.status === 'transcribing' || data.status === 'uploaded') {
        setNote(data);
        setCtx(data.ctx as NoteCtx);
        setLastDur(data.dur_seconds);
        setPhase('transcribing');
        setPendingId(data.id);
        pollForTranscript(data.id);
      } else {
        loadIntoForm(data);
        setPhase('review');
      }
    })();
    return () => {
      cancelled = true;
    };
    // Once, on arrival.
  }, []);

  const handleStopped = useCallback(
    async ({
      blob,
      contentType,
      durSeconds,
    }: {
      blob: Blob;
      contentType: string;
      durSeconds: number;
    }) => {
      setPhase('uploading');
      setLastDur(durSeconds);
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      const recordedAt = new Date().toISOString();

      const goOffline = async () => {
        await enqueueOfflineNote({
          localId: crypto.randomUUID(),
          ctx: ctxRef.current,
          recordedAt,
          durSeconds,
          audio: blob,
          audioContentType: contentType,
          queuedAt: new Date().toISOString(),
        });
        onQueuedOffline();
        setPhase('idle');
      };

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await goOffline();
        return;
      }

      try {
        const created = await uploadNote(supabase, {
          ctx: ctxRef.current,
          recordedAt,
          durSeconds,
          audio: blob,
          audioContentType: contentType,
        });
        setPhase('transcribing');
        onChanged?.();
        setPendingId(created.id);
        pollForTranscript(created.id);
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          setPhase('locked');
          return;
        }
        await goOffline();
      }
    },
    [onChanged, onQueuedOffline, pollForTranscript, supabase],
  );

  const recorder = useAudioRecorder(handleStopped);

  useEffect(() => {
    if (autoStart && phase === 'idle' && recorder.state === 'idle') {
      void recorder.start();
    }
    // Deliberately [autoStart] only: this should fire once, right after
    // mount, when the player arrived via "Record a note" (?record=1) — not
    // re-trigger every time phase or recorder.state later changes.
  }, [autoStart]);

  useEffect(() => {
    if (recorder.state === 'recording') setPhase('recording');
    announceScribeRecording(recorder.state === 'recording');
  }, [recorder.state]);

  useEffect(() => () => announceScribeRecording(false), []);

  // The mobile Scribe tab (tab-bar.tsx): on this page a tap starts or stops.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  useEffect(
    () =>
      onScribeToggle(() => {
        if (recorder.state === 'recording') recorder.stop();
        else if (phaseRef.current === 'idle') void recorder.start();
      }),
    [recorder],
  );

  const reset = useCallback(() => {
    stopPolling();
    setNote(null);
    setTranscript('');
    setMood(null);
    setMoodProposed(false);
    setResult('');
    setOpponent('');
    setTags([]);
    setCoachShare(!isFree);
    setLastDur(0);
    setPendingId(null);
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPhase(atLimit ? 'locked' : 'idle');
  }, [atLimit, isFree, stopPolling]);

  const handleSave = useCallback(async () => {
    if (!note) return;
    setSaving(true);
    try {
      await updateNoteContent(supabase, note.id, {
        ctx,
        transcript,
        mood,
        result: ctx === 'match' ? result || null : null,
        opponent: ctx === 'match' ? opponent || null : null,
        tags,
        coachShare: isFree ? false : coachShare,
      });
      await saveNoteRemote(supabase, note.id);
      onToast('Saved · Content draft within 30 min, Mindset insight at 07:00');
      onSaved();
      reset();
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        setPhase('locked');
      } else {
        onToast("Couldn't save the note", 'Check your connection and try again.');
      }
    } finally {
      setSaving(false);
    }
  }, [
    coachShare,
    ctx,
    isFree,
    mood,
    note,
    onSaved,
    onToast,
    opponent,
    reset,
    result,
    supabase,
    tags,
    transcript,
  ]);

  // A failed delete used to be swallowed: the toast said "Note discarded",
  // the card reset, and the note came back from the server on the next load.
  // Now the note stays on screen and the player is told it wasn't removed.
  const handleDiscard = useCallback(async () => {
    const id = note?.id ?? pendingId;
    if (id) {
      try {
        await deleteNoteRemote(supabase, id);
      } catch {
        onToast("Couldn't discard the note. Check your connection and try again.");
        return;
      }
    }
    onToast('Note discarded');
    reset();
    onChanged?.();
  }, [note, onChanged, onToast, pendingId, reset, supabase]);

  // Record again replaces the note under review: the old upload is discarded
  // (audio and row) rather than left behind in review status. If that fails,
  // don't start a new recording on top of a note that's still there.
  const handleRecordAgain = useCallback(async () => {
    if (note) {
      try {
        await deleteNoteRemote(supabase, note.id);
      } catch {
        onToast("Couldn't replace the note. Check your connection and try again.");
        return;
      }
    }
    reset();
    void recorder.start();
  }, [note, onToast, recorder, reset, supabase]);

  const handleRetry = useCallback(async () => {
    const id = note?.id ?? pendingId;
    if (!id) return;
    const before = phase;
    setPhase('transcribing');
    setStalled(false);
    try {
      await retryNoteRemote(supabase, id);
    } catch (err) {
      setPhase(before);
      onToast(err instanceof Error ? err.message : "Retry didn't go through. Try again.");
      return;
    }
    pollForTranscript(id);
  }, [note, onToast, pendingId, phase, pollForTranscript, supabase]);

  const isFailedTranscription = note?.status === 'failed_transcription';
  const isFailedExtraction = note?.status === 'failed_extraction';
  const isFailed = isFailedTranscription || isFailedExtraction;
  const badge =
    phase === 'idle'
      ? { text: 'Ready', variant: 'secondary' as const }
      : phase === 'locked'
        ? { text: 'Locked', variant: 'secondary' as const }
        : phase === 'recording'
          ? { text: 'Recording', variant: 'danger' as const }
          : phase === 'uploading' || phase === 'transcribing'
            ? { text: 'Transcribing', variant: 'secondary' as const }
            : { text: isFailed ? 'Review' : 'Review', variant: 'lime' as const };

  const title =
    phase === 'idle' || phase === 'locked'
      ? 'New note'
      : phase === 'recording'
        ? 'Recording'
        : phase === 'uploading' || phase === 'transcribing'
          ? 'One moment'
          : 'Review your note';

  const description =
    phase === 'idle' || phase === 'locked'
      ? "Pick what this is about, then tap to record. Stop whenever you're done."
      : phase === 'recording'
        ? 'Say what happened and how it felt. The agents do the rest.'
        : phase === 'uploading' || phase === 'transcribing'
          ? 'Turning your voice into text.'
          : 'Fix anything it misheard. Mood and tags help the Mindset Coach spot patterns.';

  return (
    <Card id="recCard">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardActions>
          <Badge variant={badge.variant}>{badge.text}</Badge>
        </CardActions>
      </CardHeader>

      <div className="flex flex-col gap-6 px-6">
        {phase === 'locked' ? (
          <div className="flex flex-col gap-3 rounded-lg bg-secondary p-4 opacity-70">
            <p className="text-sm font-medium">
              You&apos;ve used {FREE_TIER_MONTHLY_NOTE_LIMIT} of {FREE_TIER_MONTHLY_NOTE_LIMIT}{' '}
              notes this month
            </p>
            <StartTrialButton size="sm" className="self-start" onToast={onToast} />
          </div>
        ) : (
          <>
            <Field>
              <FieldLabel>What is this about?</FieldLabel>
              <ToggleGroup
                type="single"
                value={ctx}
                onValueChange={(value) => value && setCtx(value as NoteCtx)}
                aria-label="Context"
                disabled={phase !== 'idle' && phase !== 'review'}
              >
                {CONTEXTS.map((c) => (
                  <ToggleGroupItem key={c.value} value={c.value}>
                    {c.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            {phase !== 'review' && (
              <div className="grid grid-cols-[auto_1fr] items-center gap-5 rounded-xl bg-surface p-5 shadow-[0_0_0_1px_var(--border)] max-sm:gap-4 max-sm:p-4">
                <button
                  type="button"
                  aria-label={recorder.state === 'recording' ? 'Stop recording' : 'Start recording'}
                  aria-pressed={recorder.state === 'recording'}
                  disabled={phase === 'uploading' || phase === 'transcribing'}
                  onClick={() =>
                    recorder.state === 'recording' ? recorder.stop() : void recorder.start()
                  }
                  className={cn(
                    'relative grid size-[4.5rem] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground',
                    'shadow-[0_6px_18px_rgba(0,0,0,.18)] transition-[transform,background-color] duration-150 active:scale-95',
                    'disabled:opacity-50 aria-pressed:bg-destructive aria-pressed:text-white',
                  )}
                >
                  {recorder.state === 'recording' && (
                    <span
                      aria-hidden="true"
                      className="absolute -inset-1.5 rounded-full border-2 border-destructive opacity-50 motion-safe:animate-ping"
                    />
                  )}
                  {phase === 'uploading' || phase === 'transcribing' ? (
                    <Spinner className="border-primary-foreground/40 border-t-primary-foreground" />
                  ) : recorder.state === 'recording' ? (
                    <span
                      aria-hidden="true"
                      className="size-[1.375rem] rounded-[0.3125rem] bg-white"
                    />
                  ) : (
                    <Mic aria-hidden="true" className="size-7 stroke-[1.75]" />
                  )}
                </button>
                <div className="flex min-w-0 flex-col gap-2.5">
                  <WaveformCanvas
                    levels={recorder.levels}
                    active={recorder.state === 'recording'}
                  />
                  <Progress
                    value={
                      ((recorder.state === 'recording' ? recorder.elapsedSeconds : lastDur) /
                        RECORDING_CAP_SECONDS) *
                      100
                    }
                  />
                  <div className="flex items-center justify-between gap-3 text-[0.8125rem] text-muted-foreground">
                    <span>
                      {phase === 'transcribing' || phase === 'uploading' ? (
                        <span className="inline-flex items-center gap-2">
                          <Spinner />
                          Transcribing, usually under 20 seconds
                        </span>
                      ) : recorder.state === 'recording' ? (
                        'Listening… tap to stop'
                      ) : isFree ? (
                        `Tap to record · ${quotaUsed} of ${FREE_TIER_MONTHLY_NOTE_LIMIT} notes this month`
                      ) : (
                        'Tap to record'
                      )}
                    </span>
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {clock(recorder.state === 'recording' ? recorder.elapsedSeconds : lastDur)} /
                      1:00
                    </span>
                  </div>
                  {stalled && phase === 'transcribing' && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warn-bg p-2.5 text-[0.8125rem]">
                      <span className="mr-auto text-warn">
                        This is taking longer than usual. The audio is safe.
                      </span>
                      <Button size="sm" variant="outline" onClick={() => void handleRetry()}>
                        Retry
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void handleDiscard()}>
                        Discard
                      </Button>
                    </div>
                  )}
                  {recorder.error && (
                    <p className="text-[0.8125rem] text-destructive">{recorder.error}</p>
                  )}
                </div>
              </div>
            )}

            {phase === 'review' && (
              <div className="flex flex-col gap-6">
                {isFailedTranscription && (
                  <div className="flex items-start justify-between gap-3 rounded-lg bg-warn-bg p-3 max-sm:flex-col">
                    <div>
                      <p className="text-sm font-medium text-warn">
                        Transcription didn&apos;t finish
                      </p>
                      <p className="text-[0.8125rem] text-muted-foreground">
                        The audio is still here. Type the note yourself, or try again.
                      </p>
                      {audioUrl && (
                        <audio controls src={audioUrl} className="mt-2 h-9 max-w-full" />
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={handleRetry}>
                        Retry
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => transcriptRef.current?.focus()}
                      >
                        Type instead
                      </Button>
                    </div>
                  </div>
                )}

                {isFailedExtraction && (
                  <div className="flex items-center justify-between rounded-lg bg-warn-bg p-3">
                    <div>
                      <p className="text-sm font-medium text-warn">
                        We couldn&apos;t read a result from this
                      </p>
                      <p className="text-[0.8125rem] text-muted-foreground">
                        Fill it in if you want the agents to have it.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleRetry}>
                      Retry
                    </Button>
                  </div>
                )}

                <Field>
                  <FieldLabel>
                    Transcript <small>· edit anything it misheard</small>
                  </FieldLabel>
                  <Textarea
                    ref={transcriptRef}
                    rows={5}
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder={isFailed ? 'Type what happened…' : undefined}
                  />
                </Field>

                <div
                  className={cn('grid gap-4', ctx === 'match' && 'grid-cols-2 max-sm:grid-cols-1')}
                >
                  <Field>
                    <FieldLabel>How did it feel?</FieldLabel>
                    <ToggleGroup
                      type="single"
                      value={mood ?? ''}
                      onValueChange={(value) => setMood((value as NoteMood) || null)}
                      aria-label="Mood"
                    >
                      {MOODS.map((m) => (
                        <ToggleGroupItem key={m.value} value={m.value}>
                          <i
                            aria-hidden="true"
                            className={cn('mr-1.5 size-2 rounded-full', m.swatch)}
                          />
                          {m.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <FieldDescription>
                      {moodProposed
                        ? "The agent guessed from your words. Correct it if it's wrong."
                        : 'Tag the mood if you want the coach to have it.'}
                    </FieldDescription>
                  </Field>

                  {ctx === 'match' && (
                    <Field>
                      <FieldLabel>
                        Result and opponent{' '}
                        <small>
                          ·{' '}
                          {note?.result || note?.opponent
                            ? 'proposed from what you said'
                            : 'optional'}
                        </small>
                      </FieldLabel>
                      <div className="flex flex-col gap-2">
                        <Input
                          className="font-mono"
                          value={result}
                          onChange={(e) => setResult(e.target.value)}
                          placeholder="L 6-4 3-6 6-7(5)"
                          aria-label="Result"
                        />
                        <Input
                          value={opponent}
                          onChange={(e) => setOpponent(e.target.value)}
                          placeholder="vs D. Kovalenko"
                          aria-label="Opponent"
                        />
                      </div>
                    </Field>
                  )}
                </div>

                <Field>
                  <FieldLabel>
                    Tags <small>· pick any</small>
                  </FieldLabel>
                  <ToggleGroup
                    type="multiple"
                    value={tags}
                    onValueChange={setTags}
                    className="flex flex-wrap gap-1.5"
                  >
                    {[...new Set([...INITIAL_TAG_VOCABULARY, ...tags])].map((tag) => (
                      <ToggleGroupItem key={tag} value={tag} size="sm">
                        {tag}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>

                {note?.cond && Array.isArray(note.cond) && note.cond.length > 0 && (
                  <Field>
                    <FieldLabel>
                      Conditions <small>· attached automatically</small>
                    </FieldLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {(note.cond as string[]).map((chip, i) => (
                        <span
                          key={`${chip}-${i}`}
                          className={cn(
                            'rounded px-1.5 py-0.5 font-mono text-xs',
                            isStampChipAt(note.cond as string[], i)
                              ? 'bg-warn-bg text-warn'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                    {isBandStamp(note.cond as string[]) && (
                      <p className="text-xs text-muted-foreground">
                        Includes data from Google Maps
                      </p>
                    )}
                  </Field>
                )}

                {!isFree && (
                  <label className="flex items-center gap-2.5 text-sm">
                    <Switch checked={coachShare} onCheckedChange={setCoachShare} />
                    Visible in the coach link
                  </label>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {phase === 'review' && (
        <CardFooter>
          <Button onClick={handleSave} disabled={saving}>
            Save note
          </Button>
          <Button variant="outline" onClick={() => void handleRecordAgain()}>
            Record again
          </Button>
          <Button variant="ghost" className="ml-auto" onClick={handleDiscard}>
            Discard
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
