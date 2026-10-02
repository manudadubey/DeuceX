'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@deucex/ui';
import { listNotes, type Note, type NoteCtx } from '@deucex/db';
import { isBandStamp, isStampChipAt } from '@deucex/agents';
import { createClient } from '@/lib/supabase/client';
import { deleteNoteRemote } from '@/lib/match-scribe/api';
import { usedBy } from '@/lib/match-scribe/pipeline';

const FILTERS: { value: NoteCtx | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'match', label: 'Matches' },
  { value: 'practice', label: 'Practice' },
  { value: 'travel', label: 'Travel' },
];

const CTX_LABEL: Record<string, string> = {
  match: 'Match',
  practice: 'Practice',
  travel: 'Travel',
  other: 'Other',
};

// The prototype's mood colours (`.moodstrip`, `.mood-*`): chart-2, ok, muted, warn.
export const MOODS = [
  { value: 'energised', label: 'Energised', dot: 'bg-chart-2', text: 'text-chart-2' },
  { value: 'confident', label: 'Confident', dot: 'bg-ok', text: 'text-ok' },
  { value: 'flat', label: 'Flat', dot: 'bg-muted-foreground/55', text: 'text-muted-foreground' },
  { value: 'frustrated', label: 'Frustrated', dot: 'bg-warn', text: 'text-warn' },
] as const;

function moodOf(mood: string | null) {
  return MOODS.find((m) => m.value === mood) ?? null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PROCESSING_MINUTES = 30;

function localDay(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function duration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function matches(note: Note, needle: string): boolean {
  const tags = Array.isArray(note.tags) ? (note.tags as string[]).join(' ') : '';
  return [note.transcript, note.result, note.opponent, tags]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

// `#hist` (PRD-02 section 4.5, S-17): the last 30 days of saved notes, a
// mood strip, a context filter and search across transcript, result,
// opponent and tags. Everything is loaded once for the window and filtered
// here, so the count and the strip always describe the whole 30 days.
export function HistorySection({
  refreshKey,
  onToast,
}: {
  refreshKey: number;
  onToast: (title: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [notes, setNotes] = useState<Note[]>([]);
  const [drafted, setDrafted] = useState<Set<string>>(new Set());
  const [insightDate, setInsightDate] = useState<string | null>(null);
  const [filter, setFilter] = useState<NoteCtx | 'all'>('all');
  const [search, setSearch] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const rows = (await listNotes(supabase)).filter((n) => n.status === 'saved');
    const ids = rows.map((n) => n.id);
    const [{ data: drafts }, { data: insight }] = await Promise.all([
      ids.length
        ? supabase.from('patron_updates').select('note_id').in('note_id', ids)
        : Promise.resolve({ data: [] as { note_id: string | null }[] }),
      supabase
        .from('insights')
        .select('date')
        .eq('delivery', 'delivered')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setNotes(rows);
    setDrafted(new Set((drafts ?? []).map((d) => d.note_id).filter((id): id is string => !!id)));
    setInsightDate(insight?.date ?? null);
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const needle = search.trim().toLowerCase();
  const visible = notes.filter(
    (n) => (filter === 'all' || n.ctx === filter) && (!needle || matches(n, needle)),
  );

  // One cell per local day, oldest first; a day's colour is its latest tagged mood.
  const strip = useMemo(() => {
    const byDay = new Map<string, string>();
    for (const n of [...notes].reverse()) {
      if (n.mood) byDay.set(localDay(n.recorded_at), n.mood);
    }
    const today = new Date();
    return Array.from({ length: 30 }, (_, i) => {
      const day = new Date(today.getTime() - (29 - i) * DAY_MS);
      return { day, mood: byDay.get(localDay(day)) ?? null };
    });
  }, [notes]);

  const handleDelete = async (id: string) => {
    try {
      await deleteNoteRemote(supabase, id);
      onToast('Note deleted');
    } catch {
      onToast("Couldn't delete the note. Try again.");
    }
    setConfirmingId(null);
    void load();
  };

  const firstDay = strip[0]!.day.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Past notes</CardTitle>
        <CardDescription>Last 30 days. Colour is the mood you tagged.</CardDescription>
        <CardActions>
          <Badge variant="secondary" className="font-mono">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </Badge>
        </CardActions>
      </CardHeader>
      <div className="flex flex-col gap-4 px-6">
        <div className="flex flex-col gap-2">
          <div
            className="grid grid-cols-[repeat(30,1fr)] gap-[3px]"
            aria-label="Mood over the last 30 days"
          >
            {strip.map(({ day, mood }) => {
              const m = moodOf(mood);
              return (
                <i
                  key={day.toISOString()}
                  title={`${day.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} · ${m?.label ?? 'No note'}`}
                  className={cn('block h-[1.375rem] rounded', m?.dot ?? 'bg-muted')}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3.5 text-xs text-muted-foreground">
            <span>{firstDay}</span>
            {MOODS.map((m, i) => (
              <span
                key={m.value}
                className={cn('inline-flex items-center gap-1.5', i === 0 && 'ml-auto')}
              >
                <i className={cn('size-2 rounded-full', m.dot)} />
                {m.label}
              </span>
            ))}
            <span>Today</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && setFilter(v as NoteCtx | 'all')}
            aria-label="Filter"
            variant="segmented"
          >
            {FILTERS.map((f) => (
              <ToggleGroupItem key={f.value} value={f.value} size="sm">
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <label className="ml-auto flex h-9 max-w-xs flex-[1_1_12.5rem] items-center gap-2 rounded-md border border-input bg-field px-2.5 shadow-[0_1px_2px_rgba(0,0,0,.05)] focus-within:border-ring">
            <Search aria-hidden="true" className="size-4 text-muted-foreground" />
            <input
              placeholder="Search transcripts"
              aria-label="Search transcripts"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        </div>

        {loaded && visible.length === 0 && (
          <Empty
            icon={<Search aria-hidden="true" />}
            title={notes.length === 0 ? 'No notes yet' : 'No notes match'}
          >
            {notes.length === 0
              ? 'Notes you save show up here for 30 days.'
              : 'Try another word, or clear the filter.'}
          </Empty>
        )}

        <div className="flex flex-col gap-2">
          {visible.map((note) => {
            const m = moodOf(note.mood);
            const recorded = new Date(note.recorded_at);
            const used = usedBy(note, drafted.has(note.id), insightDate);
            const savedMinutesAgo = note.transcript_confirmed_at
              ? (Date.now() - new Date(note.transcript_confirmed_at).getTime()) / 60_000
              : Infinity;
            const processing = savedMinutesAgo <= PROCESSING_MINUTES && !drafted.has(note.id);
            const tags = Array.isArray(note.tags) ? (note.tags as string[]) : [];
            const cond = Array.isArray(note.cond) ? (note.cond as string[]) : [];
            const resultLine = [note.result, note.opponent?.replace(/^vs\.?\s*/i, '')]
              .filter(Boolean)
              .join(' · ');

            return (
              <div
                key={note.id}
                className="grid grid-cols-[3.25rem_1fr_auto] items-start gap-x-3.5 gap-y-1 rounded-lg bg-secondary/50 px-4 py-3.5"
              >
                <div className="row-span-3 pt-0.5 text-center">
                  <b className="block text-xl leading-none font-medium tracking-tight tabular-nums">
                    {recorded.getDate()}
                  </b>
                  <span className="text-[0.6875rem] tracking-[.06em] text-muted-foreground uppercase">
                    {recorded.toLocaleDateString('en-AU', { month: 'short' })}
                  </span>
                  <i
                    className={cn('mx-auto mt-2 block size-2 rounded-full', m?.dot ?? 'bg-muted')}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {CTX_LABEL[note.ctx] ?? note.ctx}
                  {resultLine && (
                    <span className="font-mono text-[0.8125rem] font-normal text-muted-foreground">
                      {resultLine}
                    </span>
                  )}
                  {processing && (
                    <Badge variant="lime">
                      <i className="mr-1 inline-block size-1.5 rounded-full bg-current" />
                      Processing
                    </Badge>
                  )}
                </div>

                <div className="col-start-3 row-span-3 row-start-1 flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Delete"
                    className="size-8 p-0"
                    onClick={() => setConfirmingId(note.id)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </div>

                {note.transcript && (
                  <p className="col-start-2 line-clamp-2 text-[0.8125rem] leading-normal text-muted-foreground">
                    {note.transcript}
                  </p>
                )}

                <div className="col-start-2 mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {m && <span className={cn('font-medium', m.text)}>{m.label}</span>}
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-background px-2 py-0.5 text-foreground shadow-[0_0_0_1px_var(--border)]"
                    >
                      {tag}
                    </span>
                  ))}
                  <span>
                    · {recorded.toLocaleDateString('en-AU', { weekday: 'short' })}{' '}
                    {recorded.toLocaleTimeString('en-AU', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}{' '}
                    · {duration(note.dur_seconds)}
                  </span>
                  {used.length > 0 && <span>· Used by {used.join(', ')}</span>}
                </div>

                {cond.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="col-start-2 flex flex-wrap items-center gap-1">
                        {cond.map((chip, i) => (
                          <span
                            key={`${chip}-${i}`}
                            className={cn(
                              'rounded px-1.5 py-0.5 font-mono text-[0.6875rem]',
                              isStampChipAt(cond, i)
                                ? 'bg-warn-bg text-warn'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {chip}
                          </span>
                        ))}
                        {isBandStamp(cond) && (
                          <span className="text-[0.6875rem] text-muted-foreground">
                            Includes data from Google Maps
                          </span>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      Attached automatically from the venue forecast and the tournament fact sheet
                      at match time.
                    </TooltipContent>
                  </Tooltip>
                )}

                {confirmingId === note.id && (
                  <div className="col-span-2 col-start-2 mt-1.5 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted-foreground">
                    <span>Delete this note and its audio? Agents lose it too.</span>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(note.id)}>
                      Delete
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmingId(null)}>
                      Keep
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
