'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Confirm,
  Empty,
  Input,
  Stat,
  StatLabel,
  StatSub,
  StatValue,
  StatsRow,
  Table,
  TableBody,
  TableCell,
  TableCellSub,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  cn,
} from '@deucex/ui';
import { dateTime, longDate, relative, shortDate } from '@/components/format';
import { Grid } from '@/components/page';
import type {
  CalendarImportResult,
  CalendarPreview,
  CalendarSummary,
  FactCorrection,
  FeedStatusView,
  ImportPreview,
  ImportResult,
  MissingDeadlineTournament,
} from '@/lib/api';
import { browserApi, post } from '@/lib/browser-api';

const CORRECTABLE_FIELDS = ['ball', 'entry_deadline', 'altitude_m', 'surface'] as const;

const SELECT = cn(
  'h-9 rounded-md border border-input bg-field px-2.5 text-sm text-foreground',
  'shadow-[0_1px_2px_rgba(0,0,0,.05)] outline-none focus:border-ring max-[900px]:min-h-11',
);

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    browserApi<T>(path)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [path]);
  useEffect(load, [load]);
  return { data, error, reload: load, setError };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-danger">
      {error}
    </p>
  ) : null;
}

export function IngestionClient() {
  return (
    <>
      <Feeds />
      <Grid>
        <SnapshotImport />
        <Corrections />
      </Grid>
      <CalendarImport />
      <MissingDeadlines />
    </>
  );
}

const CALENDAR_COLUMNS =
  'tour, name, tier, surface, indoor_outdoor, city, country, lat, lon, altitude_m, start_date, end_date, entry_deadline, last_year_cut, ball, prize_currency, prize, points';

const TOUR_LABELS: Record<string, string> = {
  atp: 'ATP',
  wta: 'WTA',
  itf_men: "ITF men's",
  itf_women: "ITF women's",
};

// A calendar moves weekly (new events, late deadlines), so a week without an
// import is worth flagging.
const IMPORT_DUE_MS = 7 * 24 * 60 * 60 * 1000;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`;
}

// What's in the calendar now, before anything is pasted.
function CalendarStatus({ summary }: { summary: CalendarSummary }) {
  if (summary.upcomingCount === 0) {
    return (
      <p role="status" className="rounded-lg bg-warn-bg p-3 text-sm text-warn">
        The calendar has no upcoming events, so every player&apos;s shortlist is empty. Import a
        calendar below.
      </p>
    );
  }
  const last = summary.lastImport;
  const due = last !== null && Date.now() - new Date(last.at).getTime() > IMPORT_DUE_MS;
  return (
    <StatsRow className="max-[1100px]:grid-cols-2">
      <Stat>
        <StatLabel>Upcoming events</StatLabel>
        <StatValue>{summary.upcomingCount.toLocaleString('en-AU')}</StatValue>
        <StatSub>
          {summary.byTour.map((t) => `${TOUR_LABELS[t.tour] ?? t.tour} ${t.count}`).join(' · ')}
        </StatSub>
      </Stat>
      <Stat>
        <StatLabel>Covers</StatLabel>
        <StatValue className="text-xl">
          {shortDate(summary.firstStart)} – {shortDate(summary.lastStart)}
        </StatValue>
        <StatSub>Start dates of upcoming events</StatSub>
      </Stat>
      <Stat>
        <StatLabel>Next entry deadline</StatLabel>
        <StatValue className="text-xl">
          {summary.nextDeadline ? longDate(summary.nextDeadline.date) : 'None ahead'}
        </StatValue>
        <StatSub>
          {summary.nextDeadline
            ? `${plural(summary.nextDeadline.count, 'event')} close that day`
            : 'Every upcoming event has closed'}
          {summary.missingDeadlineCount > 0 ? (
            <span className="text-warn">
              {' '}
              · {plural(summary.missingDeadlineCount, 'event')} with no deadline
            </span>
          ) : null}
        </StatSub>
      </Stat>
      <Stat>
        <StatLabel className="flex items-center gap-2">
          Last import
          {due ? (
            <Badge variant="warn" className="ml-auto">
              Import due
            </Badge>
          ) : null}
        </StatLabel>
        <StatValue className={cn('text-xl', due && 'text-warn')}>
          {last ? relative(last.at) : 'Never'}
        </StatValue>
        <StatSub>
          {last
            ? [
                dateTime(last.at),
                last.by,
                last.newCount !== null
                  ? `${last.newCount} new, ${last.updateCount ?? 0} updated`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : 'No import on record'}
        </StatSub>
      </Stat>
    </StatsRow>
  );
}

// The tournament calendar (28 September 2026): the Tournament Agent's only
// source of events until a licensed feed exists.
function CalendarImport() {
  const summary = useLoad<CalendarSummary>('/admin/tournaments/calendar-summary');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<CalendarPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handlePreview() {
    setBusy(true);
    setError(null);
    setApplied(null);
    try {
      setPreview(await post<CalendarPreview>('/admin/tournaments/import/preview', { csv }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    setBusy(true);
    setError(null);
    try {
      const r = await post<CalendarImportResult>('/admin/tournaments/import/apply', {
        csv,
        reason,
      });
      setApplied(
        `Imported: ${r.newCount} new, ${r.updateCount} updated, ${r.unchangedCount} unchanged. Re-ran ${r.rerun} players' shortlists. Logged to the audit trail.`,
      );
      setPreview(null);
      setConfirming(false);
      setReason('');
      setCsv('');
      summary.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const changes = preview ? preview.newCount + preview.updateCount : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tournament calendar import</CardTitle>
        <CardDescription>
          The Tournament Agent shortlists only events in this calendar. Tour, name and start date
          identify an event, so re-importing a file updates it and never adds a second copy.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ErrorLine error={summary.error} />
        {summary.data ? <CalendarStatus summary={summary.data} /> : null}
        <details className="text-[0.8125rem] text-muted-foreground">
          <summary className="cursor-pointer text-foreground">File format</summary>
          <p className="mt-1">
            Columns: {CALENDAR_COLUMNS}. Dates as YYYY-MM-DD; prize and points as
            &quot;R1:1620;R2:2400;QF:3900&quot; (Q1 to SF), prize in the currency the event
            publishes (prize_currency, e.g. USD). For ITF&apos;s calendar exports, convert them
            first with apps/api/scripts/itf-calendar.ts.
          </p>
        </details>
        <label className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Choose a CSV file</span>
          <span>or paste it below</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                setCsv(await file.text());
                setPreview(null);
              }
            }}
          />
        </label>
        <Textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="Paste CSV here"
          rows={4}
        />
        <div>
          <Button size="sm" variant="outline" onClick={handlePreview} disabled={busy || !csv}>
            Preview changes
          </Button>
        </div>
        <ErrorLine error={error} />
        {applied ? <p className="text-sm">{applied}</p> : null}
        {preview ? (
          <>
            <p className="text-[0.8125rem] text-muted-foreground">
              {preview.rows} rows: {preview.newCount} new, {preview.updateCount} updated,{' '}
              {preview.unchangedCount} unchanged.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead>Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.entries.map((e) => (
                  <TableRow key={`${e.tour}-${e.name}-${e.startDate}`}>
                    <TableCell>
                      {e.name}
                      <TableCellSub>
                        {e.tier} · {e.tour}
                        {e.entryDeadline
                          ? ` · entry closes ${shortDate(e.entryDeadline)}`
                          : ' · no deadline'}
                      </TableCellSub>
                    </TableCell>
                    <TableCell>{shortDate(e.startDate)}</TableCell>
                    <TableCell>
                      {e.action === 'new' ? (
                        <Badge variant="ok">New</Badge>
                      ) : e.action === 'update' ? (
                        <>
                          <Badge variant="warn">Update</Badge>
                          <TableCellSub>{e.changedFields.join(', ')}</TableCellSub>
                        </>
                      ) : (
                        <Badge variant="secondary">Unchanged</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {confirming ? (
              <Confirm
                title={`Apply ${changes} calendar ${changes === 1 ? 'change' : 'changes'}`}
                description={
                  <span className="flex flex-col gap-2">
                    <span>
                      Every player&apos;s shortlist is re-run now, so new events show without
                      waiting for Sunday. A re-run sends no notification. Events stay until
                      corrected or re-imported.
                    </span>
                    <Textarea
                      aria-label="Reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      className="min-h-16"
                      placeholder="Reason (required, stored verbatim)"
                    />
                  </span>
                }
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirming(false)}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleApply} disabled={busy || !reason.trim()}>
                      {busy ? 'Saving…' : 'Apply calendar'}
                    </Button>
                  </>
                }
              />
            ) : (
              <div>
                <Button size="sm" onClick={() => setConfirming(true)} disabled={changes === 0}>
                  Apply…
                </Button>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

// AD-17: every feed with cadence, last and next run, and a detail line.
function Feeds() {
  const { data, error } = useLoad<{ feeds: FeedStatusView[] }>('/admin/rankings/feeds');
  return (
    <section className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-sm:grid-cols-1">
      <ErrorLine error={error} />
      {data?.feeds.map((f) => (
        <Card key={f.feed} className="p-4">
          <div className="flex items-center gap-2">
            <span className="font-medium">{f.feed}</span>
            <Badge variant={f.overdue ? 'warn' : 'ok'} className="ml-auto">
              {f.overdue ? 'Attention' : 'Healthy'}
            </Badge>
          </div>
          <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-y-1 text-[0.8125rem]">
            <dt className="text-muted-foreground">Cadence</dt>
            <dd>{f.cadence}</dd>
            <dt className="text-muted-foreground">Last run</dt>
            <dd>{f.last_run_at ? dateTime(f.last_run_at) : 'Never'}</dd>
            <dt className="text-muted-foreground">Next due</dt>
            <dd>{dateTime(f.next_expected_at)}</dd>
            <dt className="text-muted-foreground">Detail</dt>
            <dd>
              {f.row_count !== null ? `${f.row_count} rows` : (f.last_result ?? 'No runs yet')}
            </dd>
          </dl>
        </Card>
      ))}
    </section>
  );
}

// AD-18: preview per-player changes and unmatched rows; Apply states the
// stage changes and needs a written reason (AD-5).
function SnapshotImport() {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handlePreview() {
    setBusy(true);
    setError(null);
    setApplied(null);
    try {
      setPreview(await post<ImportPreview>('/admin/rankings/import/preview', { csv }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    setBusy(true);
    setError(null);
    try {
      const result = await post<ImportResult>('/admin/rankings/import/apply', { csv, reason });
      setApplied(
        `Applied: ${result.matchedCount} players updated, ${result.stageChangeCount} stage changes, ${result.unmatchedCount} unmatched rows. Logged to the audit trail.`,
      );
      setPreview(null);
      setConfirming(false);
      setReason('');
      setCsv('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    setCsv(await file.text());
    setPreview(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ranking snapshot import</CardTitle>
        <CardDescription>
          CSV columns: tour, tour_player_id, itf_id, name, country, week_start, tour_singles_rank,
          tour_singles_points, tour_doubles_rank, tour_doubles_points, itf_rank, itf_points. Rows
          that match no player are listed, not applied.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Choose a CSV file</span>
          <span>or paste it below</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
        <Textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="Paste CSV here"
          rows={4}
        />
        <div>
          <Button size="sm" variant="outline" onClick={handlePreview} disabled={busy || !csv}>
            Preview changes
          </Button>
        </div>
        <ErrorLine error={error} />
        {applied ? <p className="text-sm">{applied}</p> : null}
        {preview ? (
          <>
            <p className="text-[0.8125rem] text-muted-foreground">
              {preview.rows} rows: {preview.matched.length} matched, {preview.unmatchedCount}{' '}
              unmatched, {preview.stageChangeCount} stage changes.
            </p>
            {preview.matched.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead numeric>Rank</TableHead>
                    <TableHead>Stage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.matched.map((m) => (
                    <TableRow key={m.playerId}>
                      <TableCell>{m.name}</TableCell>
                      <TableCell numeric>
                        {m.beforeTourSinglesRank ?? '–'} → {m.afterTourSinglesRank ?? '–'}
                      </TableCell>
                      <TableCell>
                        {m.beforeStage ?? '–'} → {m.afterStage}{' '}
                        {m.stageChanged ? <Badge variant="warn">changes</Badge> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
            {preview.unmatched.length ? (
              <div className="text-[0.8125rem]">
                <p className="text-muted-foreground">
                  Unmatched (kept as directory entries, linked to no player):
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {preview.unmatched.slice(0, 20).map((u, i) => (
                    <li key={i}>
                      {u.name} ({u.country}) · {u.tourPlayerId ?? u.itfId}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {confirming ? (
              <Confirm
                title={`Apply this snapshot to ${preview.matched.length} players`}
                description={
                  <span className="flex flex-col gap-2">
                    <span>
                      Stages are re-detected, dashboards refresh, and {preview.stageChangeCount}{' '}
                      player
                      {preview.stageChangeCount === 1 ? ' moves' : 's move'} stage. Nothing is sent
                      to players until their next morning run.
                    </span>
                    <Textarea
                      aria-label="Reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      className="min-h-16"
                      placeholder="Reason (required, stored verbatim)"
                    />
                  </span>
                }
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirming(false)}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleApply} disabled={busy || !reason.trim()}>
                      Apply snapshot
                    </Button>
                  </>
                }
              />
            ) : (
              <div>
                <Button
                  size="sm"
                  onClick={() => setConfirming(true)}
                  disabled={!preview.matched.length}
                >
                  Apply…
                </Button>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

// AD-20: proposed with a source, shown as a before and after diff, applied or rejected.
function Corrections() {
  const { data, error, reload, setError } = useLoad<{ corrections: FactCorrection[] }>(
    '/admin/corrections',
  );
  const [tournamentId, setTournamentId] = useState('');
  const [field, setField] = useState<(typeof CORRECTABLE_FIELDS)[number]>('entry_deadline');
  const [after, setAfter] = useState('');
  const [source, setSource] = useState('');

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fact-sheet corrections</CardTitle>
        <CardDescription>
          Proposed from a tournament fact sheet, applied here. A deadline change re-runs the
          Tournament Agent for every player who shortlisted the event.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
          <Input
            placeholder="Tournament id"
            value={tournamentId}
            onChange={(e) => setTournamentId(e.target.value)}
          />
          <select
            aria-label="Field"
            className={SELECT}
            value={field}
            onChange={(e) => setField(e.target.value as typeof field)}
          >
            {CORRECTABLE_FIELDS.map((f) => (
              <option key={f} value={f}>
                {f.replace('_', ' ')}
              </option>
            ))}
          </select>
          <Input placeholder="New value" value={after} onChange={(e) => setAfter(e.target.value)} />
          <Input placeholder="Source" value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={!tournamentId || !after || !source}
            onClick={() =>
              run(async () => {
                await post('/admin/corrections', { tournamentId, field, after, source });
                setAfter('');
                setSource('');
              })
            }
          >
            Propose correction
          </Button>
        </div>
        <ErrorLine error={error} />
        {data && data.corrections.length === 0 ? (
          <Empty title="No proposed corrections">
            Proposals wait here until ops applies or rejects them.
          </Empty>
        ) : null}
        {data && data.corrections.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tournament</TableHead>
                <TableHead>Change</TableHead>
                <TableHead className="max-[900px]:hidden">Source</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.corrections.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {c.tournaments?.name ?? c.tournament_id}
                    <TableCellSub>{c.field.replace('_', ' ')}</TableCellSub>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <span className="text-danger line-through">{c.before ?? 'unset'}</span> →{' '}
                    <span className="text-ok">{c.after}</span>
                  </TableCell>
                  <TableCell className="text-xs max-[900px]:hidden">{c.source}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => run(() => post(`/admin/corrections/${c.id}/reject`))}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => run(() => post(`/admin/corrections/${c.id}/apply`))}
                      >
                        Apply
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}

// AD-21: events with no deadline, how many players shortlisted each, a date field to set one.
function MissingDeadlines() {
  const { data, error, reload, setError } = useLoad<{ tournaments: MissingDeadlineTournament[] }>(
    '/admin/tournaments/missing-deadline',
  );
  const [dates, setDates] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  async function save(t: MissingDeadlineTournament) {
    const date = dates[t.id];
    if (!date) return;
    try {
      const result = await post<{ rerun: number }>(`/admin/tournaments/${t.id}/deadline`, {
        entryDeadline: date,
      });
      setSaved(`Deadline set for ${t.name}; ${result.rerun} shortlists re-run.`);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendar events missing a deadline</CardTitle>
        <CardDescription>
          Until one is set the event shows players &ldquo;deadline unconfirmed&rdquo; and no
          countdown runs.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ErrorLine error={error} />
        {saved ? <p className="text-sm">{saved}</p> : null}
        {data && data.tournaments.length === 0 ? (
          <Empty title="Every event has a deadline">
            Events without a published deadline appear here.
          </Empty>
        ) : null}
        {data && data.tournaments.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Starts</TableHead>
                <TableHead numeric className="max-[900px]:hidden">
                  Shortlisted by
                </TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.tournaments.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    {t.name}
                    <TableCellSub>
                      {[t.city, t.country].filter(Boolean).join(', ') || t.tour.toUpperCase()}
                    </TableCellSub>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{shortDate(t.start_date)}</TableCell>
                  <TableCell numeric className="max-[900px]:hidden">
                    {t.shortlistedCount} players
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      aria-label={`Entry deadline for ${t.name}`}
                      className="h-8 w-40"
                      value={dates[t.id] ?? ''}
                      onChange={(e) => setDates((d) => ({ ...d, [t.id]: e.target.value }))}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!dates[t.id]}
                      onClick={() => save(t)}
                    >
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
