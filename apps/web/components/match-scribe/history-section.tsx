'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardDescription,
  CardHeader,
  CardTitle,
  Confirm,
  Empty,
  Input,
  ToggleGroup,
  ToggleGroupItem,
} from '@procircuit/ui';
import { listNotes, type Note, type NoteCtx } from '@procircuit/db';
import { createClient } from '@/lib/supabase/client';
import { deleteNoteRemote } from '@/lib/match-scribe/api';

const FILTERS: { value: NoteCtx | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'match', label: 'Matches' },
  { value: 'practice', label: 'Practice' },
  { value: 'travel', label: 'Travel' },
];

function formatWhen(recordedAt: string): string {
  return new Date(recordedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// `#hist` (S-17): filter by context and search transcript/result/opponent/tags.
export function HistorySection({
  refreshKey,
  onToast,
}: {
  refreshKey: number;
  onToast: (title: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [notes, setNotes] = useState<Note[]>([]);
  const [filter, setFilter] = useState<NoteCtx | 'all'>('all');
  const [search, setSearch] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const rows = await listNotes(supabase, {
      ...(filter !== 'all' ? { ctx: filter } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    });
    setNotes(rows);
    setLoaded(true);
  }, [filter, search, supabase]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const handleDelete = async (id: string) => {
    await deleteNoteRemote(supabase, id);
    setConfirmingId(null);
    onToast('Note deleted');
    void load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Past notes</CardTitle>
        <CardDescription>Last 30 days.</CardDescription>
        <CardActions>
          <Badge variant="secondary">{notes.length} notes</Badge>
        </CardActions>
      </CardHeader>
      <div className="flex flex-col gap-4 px-6">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && setFilter(v as NoteCtx | 'all')}
            aria-label="Filter"
          >
            {FILTERS.map((f) => (
              <ToggleGroupItem key={f.value} value={f.value} size="sm">
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Input
            placeholder="Search transcripts"
            aria-label="Search transcripts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {loaded && notes.length === 0 && <Empty title="No notes match" />}

        <div className="flex flex-col divide-y divide-border">
          {notes.map((note) => (
            <div key={note.id} className="flex flex-col gap-1.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {formatWhen(note.recorded_at)} · {note.ctx}
                </span>
                <div className="flex items-center gap-2">
                  {note.mood && <Badge variant="secondary">{note.mood}</Badge>}
                  <span className="font-mono text-[0.8125rem] text-muted-foreground">
                    0:{String(note.dur_seconds).padStart(2, '0')}
                  </span>
                </div>
              </div>
              {note.result && (
                <p className="text-sm">
                  {note.result}
                  {note.opponent ? ` · ${note.opponent}` : ''}
                </p>
              )}
              {note.transcript && (
                <p className="line-clamp-2 text-[0.8125rem] text-muted-foreground">
                  {note.transcript}
                </p>
              )}
              {Array.isArray(note.tags) && note.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(note.tags as string[]).map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {confirmingId === note.id ? (
                <Confirm
                  title="Delete this note?"
                  description="Delete this note and its audio? Agents lose it too."
                  actions={
                    <>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(note.id)}>
                        Delete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                        Cancel
                      </Button>
                    </>
                  }
                />
              ) : (
                <div>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmingId(note.id)}>
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
