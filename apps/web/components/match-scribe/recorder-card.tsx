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
} from '@procircuit/ui';
import {
  FREE_TIER_MONTHLY_NOTE_LIMIT,
  INITIAL_TAG_VOCABULARY,
  getNote,
  updateNoteContent,
  type Note,
  type NoteCtx,
  type NoteMood,
} from '@procircuit/db';
import { createClient } from '@/lib/supabase/client';
import {
  QuotaExceededError,
  deleteNoteRemote,
  retryTranscriptionRemote,
  saveNoteRemote,
  uploadNote,
} from '@/lib/match-scribe/api';
import { enqueueOfflineNote } from '@/lib/match-scribe/offline-queue';
import { RECORDING_CAP_SECONDS, useAudioRecorder } from './use-audio-recorder';
import { WaveformCanvas } from './waveform-canvas';

const CONTEXTS: { value: NoteCtx; label: string }[] = [
  { value: 'match', label: 'Match' },
  { value: 'practice', label: 'Practice' },
  { value: 'travel', label: 'Travel' },
  { value: 'other', label: 'Other' },
];

const MOODS: { value: NoteMood; label: string }[] = [
  { value: 'frustrated', label: 'Frustrated' },
  { value: 'flat', label: 'Flat' },
  { value: 'confident', label: 'Confident' },
  { value: 'energised', label: 'Energised' },
];

type Phase = 'idle' | 'recording' | 'uploading' | 'transcribing' | 'review' | 'locked';

const POLL_INTERVAL_MS = 1500;

export interface RecorderCardProps {
  playerId: string;
  quotaUsed: number;
  autoStart?: boolean;
  onQueuedOffline: () => void;
  onSaved: () => void;
  onToast: (title: string, description?: string) => void;
}

export function RecorderCard({
  quotaUsed,
  autoStart,
  onQueuedOffline,
  onSaved,
  onToast,
}: RecorderCardProps) {
  const supabase = useMemo(() => createClient(), []);
  const [ctx, setCtx] = useState<NoteCtx>('match');
  const [phase, setPhase] = useState<Phase>(
    quotaUsed >= FREE_TIER_MONTHLY_NOTE_LIMIT ? 'locked' : 'idle',
  );
  const [note, setNote] = useState<Note | null>(null);
  const [transcript, setTranscript] = useState('');
  const [mood, setMood] = useState<NoteMood | null>(null);
  const [result, setResult] = useState('');
  const [opponent, setOpponent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [coachShare, setCoachShare] = useState(true);
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const loadIntoForm = useCallback((row: Note) => {
    setNote(row);
    setTranscript(row.transcript ?? '');
    setMood((row.mood as NoteMood | null) ?? null);
    setResult(row.result ?? '');
    setOpponent(row.opponent ?? '');
    setTags(Array.isArray(row.tags) ? (row.tags as string[]) : []);
    setCoachShare(row.coach_share);
  }, []);

  const pollForTranscript = useCallback(
    (noteId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        const row = await getNote(supabase, noteId);
        if (!row) return;
        if (row.status === 'review' || row.status === 'failed_transcription') {
          stopPolling();
          loadIntoForm(row);
          setPhase('review');
        }
      }, POLL_INTERVAL_MS);
    },
    [loadIntoForm, stopPolling, supabase],
  );

  useEffect(() => stopPolling, [stopPolling]);

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
      const recordedAt = new Date().toISOString();

      const goOffline = async () => {
        await enqueueOfflineNote({
          localId: crypto.randomUUID(),
          ctx,
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
          ctx,
          recordedAt,
          durSeconds,
          audio: blob,
          audioContentType: contentType,
        });
        setPhase('transcribing');
        pollForTranscript(created.id);
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          setPhase('locked');
          return;
        }
        await goOffline();
      }
    },
    [ctx, onQueuedOffline, pollForTranscript, supabase],
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
  }, [recorder.state]);

  const reset = useCallback(() => {
    stopPolling();
    setNote(null);
    setTranscript('');
    setMood(null);
    setResult('');
    setOpponent('');
    setTags([]);
    setCoachShare(true);
    setPhase(quotaUsed >= FREE_TIER_MONTHLY_NOTE_LIMIT ? 'locked' : 'idle');
  }, [quotaUsed, stopPolling]);

  const handleSave = useCallback(async () => {
    if (!note) return;
    setSaving(true);
    try {
      await updateNoteContent(supabase, note.id, {
        transcript,
        mood,
        result: result || null,
        opponent: opponent || null,
        tags,
        coachShare,
      });
      await saveNoteRemote(supabase, note.id);
      onToast('Saved · Content draft within 30 min, Mindset insight at 06:00');
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

  const handleDiscard = useCallback(async () => {
    if (note) {
      await deleteNoteRemote(supabase, note.id);
    }
    onToast('Note discarded');
    reset();
  }, [note, onToast, reset, supabase]);

  const handleRetry = useCallback(async () => {
    if (!note) return;
    setPhase('transcribing');
    await retryTranscriptionRemote(supabase, note.id);
    pollForTranscript(note.id);
  }, [note, pollForTranscript, supabase]);

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const isFailed = note?.status === 'failed_transcription';
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
          : 'Fix anything Whisper misheard. Mood and tags help the Mindset Coach spot patterns.';

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
            <Button
              size="sm"
              className="self-start"
              onClick={() => onToast('Start Pro trial · coming soon')}
            >
              Start Pro trial
            </Button>
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
                disabled={phase !== 'idle'}
              >
                {CONTEXTS.map((c) => (
                  <ToggleGroupItem key={c.value} value={c.value}>
                    {c.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            {phase !== 'review' && (
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  aria-label={recorder.state === 'recording' ? 'Stop recording' : 'Start recording'}
                  aria-pressed={recorder.state === 'recording'}
                  disabled={phase === 'uploading' || phase === 'transcribing'}
                  onClick={() =>
                    recorder.state === 'recording' ? recorder.stop() : recorder.start()
                  }
                  className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50 aria-pressed:bg-destructive"
                >
                  {phase === 'uploading' || phase === 'transcribing' ? (
                    <Spinner className="border-primary-foreground/40 border-t-primary-foreground" />
                  ) : (
                    <Mic aria-hidden="true" className="size-6" />
                  )}
                </button>
                <div className="flex-1">
                  <WaveformCanvas
                    levels={recorder.levels}
                    active={recorder.state === 'recording'}
                  />
                  <Progress
                    value={(recorder.elapsedSeconds / RECORDING_CAP_SECONDS) * 100}
                    className="mt-1"
                  />
                  <div className="mt-1 flex items-center justify-between text-[0.8125rem] text-muted-foreground">
                    <span>
                      {phase === 'transcribing' || phase === 'uploading' ? (
                        <span className="inline-flex items-center gap-2">
                          <Spinner />
                          Transcribing with Whisper…
                        </span>
                      ) : recorder.state === 'recording' ? (
                        'Listening… tap to stop'
                      ) : (
                        'Tap to record'
                      )}
                    </span>
                    <span className="font-mono">
                      0:{String(recorder.elapsedSeconds).padStart(2, '0')} / 1:00
                    </span>
                  </div>
                  {recorder.error && (
                    <p className="mt-1 text-[0.8125rem] text-destructive">{recorder.error}</p>
                  )}
                </div>
              </div>
            )}

            {phase === 'review' && (
              <div className="flex flex-col gap-6">
                {isFailed && (
                  <div className="flex items-center justify-between rounded-lg bg-warn-bg p-3">
                    <div>
                      <p className="text-sm font-medium text-warn">
                        Transcription didn&apos;t finish
                      </p>
                      <p className="text-[0.8125rem] text-muted-foreground">
                        The audio is still here. Type the note yourself, or try again.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleRetry}>
                      Retry
                    </Button>
                  </div>
                )}

                <Field>
                  <FieldLabel>
                    Transcript <small>· Whisper · edit anything it misheard</small>
                  </FieldLabel>
                  <Textarea
                    rows={5}
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder={isFailed ? 'Type what happened…' : undefined}
                  />
                </Field>

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
                        {m.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <FieldDescription>
                    Tag the mood if you want the coach to have it.
                  </FieldDescription>
                </Field>

                {ctx === 'match' && (
                  <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                    <Field>
                      <FieldLabel>Result</FieldLabel>
                      <input
                        className="h-9 w-full rounded-md border border-input bg-field px-2.5 font-mono text-sm shadow-[0_1px_2px_rgba(0,0,0,.05)] outline-none focus:border-ring"
                        value={result}
                        onChange={(e) => setResult(e.target.value)}
                        placeholder="L 6-4 3-6 6-7(5)"
                        aria-label="Result"
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Opponent</FieldLabel>
                      <input
                        className="h-9 w-full rounded-md border border-input bg-field px-2.5 text-sm shadow-[0_1px_2px_rgba(0,0,0,.05)] outline-none focus:border-ring"
                        value={opponent}
                        onChange={(e) => setOpponent(e.target.value)}
                        placeholder="vs D. Kovalenko"
                        aria-label="Opponent"
                      />
                    </Field>
                  </div>
                )}

                <Field>
                  <FieldLabel>
                    Tags <small>· pick any</small>
                  </FieldLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {INITIAL_TAG_VOCABULARY.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={tags.includes(tag)}
                        onClick={() => toggleTag(tag)}
                        className="inline-flex h-[1.875rem] items-center rounded-md border border-input bg-secondary px-2.5 text-[0.8125rem] font-medium aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </Field>

                {note?.cond && Array.isArray(note.cond) && note.cond.length > 0 && (
                  <Field>
                    <FieldLabel>
                      Conditions <small>· attached automatically</small>
                    </FieldLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {(note.cond as string[]).map((chip) => (
                        <Badge key={chip} variant="secondary">
                          {chip}
                        </Badge>
                      ))}
                    </div>
                  </Field>
                )}

                <label className="flex items-center gap-2.5 text-sm">
                  <Switch checked={coachShare} onCheckedChange={setCoachShare} />
                  Visible in the coach link
                </label>
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
          <Button
            variant="outline"
            onClick={() => {
              reset();
              void recorder.start();
            }}
          >
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
