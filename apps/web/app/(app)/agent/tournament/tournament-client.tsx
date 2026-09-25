'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Tabs,
  TabsList,
  TabsTrigger,
  Toast,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@deucex/ui';
import { parseBlockedDateRanges, type Unit } from '@deucex/agents';
import { updateUnits, type Units } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';
import { daysUntil, loadTournamentSnapshot, type TournamentSnapshot } from '@/lib/tournament/load';
import { CalendarTab } from '@/components/tournament/calendar-tab';
import { DetailPanel } from '@/components/tournament/detail-panel';
import { PausedNotice } from '@/components/agents/paused-notice';

function mondayIso(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// The Calendar tab's own "blocked weeks shaded across all rows" (T-17):
// every Monday-week-start a parsed blocked date range touches, not just
// the range's own start — a range can span more than one calendar week.
function blockedWeekStartsFor(blockedDates: string | null, now: Date): string[] {
  const ranges = parseBlockedDateRanges(blockedDates, now);
  const weeks = new Set<string>();
  for (const range of ranges) {
    let cursor = new Date(`${range.start}T00:00:00Z`);
    const end = new Date(`${range.end}T00:00:00Z`);
    while (cursor <= end) {
      weeks.add(mondayIso(cursor));
      cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  }
  return [...weeks];
}

export interface TournamentClientProps {
  playerId: string;
  homeCurrency: string;
  weeklyBudget: number | null;
  blockedDates: string | null;
  isFree: boolean;
  initialUnits: Units;
}

type View = 'list' | 'cal';

export function TournamentClient({
  playerId,
  homeCurrency,
  weeklyBudget,
  blockedDates,
  isFree,
  initialUnits,
}: TournamentClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ title: string } | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  // CE-17: synced with Preferences > Units and the Equipment pane's own
  // control, all three writing the same players.units column.
  const [units, setUnits] = useState<Units>(initialUnits);
  const unit: Unit = units === 'imperial' ? 'lb' : 'kg';

  const showToast = useCallback((title: string) => {
    setToast({ title });
    setToastOpen(true);
  }, []);

  const handleUnitChange = useCallback(
    async (next: Unit) => {
      const nextUnits: Units = next === 'lb' ? 'imperial' : 'metric';
      setUnits(nextUnits);
      await updateUnits(supabase, { playerId, units: nextUnits });
      showToast(`Tension shown in ${next}`);
    },
    [playerId, showToast, supabase],
  );

  const load = useCallback(async () => {
    const data = await loadTournamentSnapshot(supabase, playerId, homeCurrency, weeklyBudget);
    setSnapshot(data);
    setLoaded(true);
    setSelectedId((current) => current ?? data.candidates[0]?.tournamentId ?? null);
  }, [supabase, playerId, homeCurrency, weeklyBudget]);

  useEffect(() => {
    void load();
  }, [load]);

  const candidates = snapshot?.candidates ?? [];
  const selected = candidates.find((c) => c.tournamentId === selectedId) ?? candidates[0] ?? null;

  const now = new Date();
  const deadlineThisWeek = candidates.filter((c) => {
    const days = daysUntil(c.entryDeadline, now);
    return c.status === 'none' && days != null && days <= 7 && days >= 0;
  });
  const decidedCount = candidates.filter((c) => c.status !== 'none').length;
  const enteredCount = candidates.filter((c) => c.status === 'entered').length;
  const skippedCount = candidates.filter(
    (c) => c.status === 'skipped' || c.status === 'withdrawn',
  ).length;

  const handleStartTrial = () => showToast('Pro trial — coming soon');

  return (
    <ToastProvider>
      <header className="flex flex-col gap-2 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tournament Agent</h1>
          <p className="text-sm text-muted-foreground">
            Weekly shortlist, ranked by cost-to-prize. Runs Sunday 20:00 UTC.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" title="Runs weekly, Sunday 20:00 UTC">
            Weekly · Sun 20:00 UTC
          </Badge>
        </div>
      </header>
      <PausedNotice agent="tournament" label="The Tournament Agent" />

      {loaded && (
        <section className="grid grid-cols-4 gap-4 max-[900px]:grid-cols-2">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Events scanned</div>
            <div className="mt-1 font-mono text-2xl font-medium">{snapshot?.scannedCount ?? 0}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Shortlisted</div>
            <div className="mt-1 font-mono text-2xl font-medium">{candidates.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              within budget, no blocked dates
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Deadline this week</div>
            <div
              className="mt-1 font-mono text-2xl font-medium"
              style={deadlineThisWeek.length > 0 ? { color: 'var(--warn)' } : undefined}
            >
              {deadlineThisWeek.length}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {deadlineThisWeek[0]?.name ?? 'none'}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Decisions</div>
            <div className="mt-1 font-mono text-2xl font-medium">
              {decidedCount}{' '}
              <small className="text-sm font-normal text-muted-foreground">
                of {candidates.length}
              </small>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {decidedCount === 0
                ? 'nothing entered yet'
                : `${enteredCount} entered · ${skippedCount} skipped`}
            </div>
          </Card>
        </section>
      )}

      <Tabs value={view} onValueChange={(v) => setView(v as View)} className="mt-4">
        <TabsList>
          <TabsTrigger value="list">Shortlist</TabsTrigger>
          <TabsTrigger value="cal">Calendar</TabsTrigger>
        </TabsList>
      </Tabs>

      {!loaded ? null : candidates.length === 0 ? (
        <Card className="mt-4 p-6 text-sm text-muted-foreground">
          No shortlist yet. The first run happens Sunday 20:00 UTC, or once your ranking is
          verified.
        </Card>
      ) : view === 'list' ? (
        <div className="mt-4 grid grid-cols-2 items-start gap-4 max-[1180px]:grid-cols-1">
          <Card className="p-0">
            <div role="listbox" className="flex flex-col divide-y divide-border">
              {candidates.map((c) => {
                const days = daysUntil(c.entryDeadline, now);
                const badge =
                  c.status === 'entered'
                    ? { variant: 'ok' as const, label: 'Entered' }
                    : c.status === 'skipped' || c.status === 'withdrawn'
                      ? { variant: 'secondary' as const, label: 'Skipped' }
                      : days != null && days <= 10
                        ? { variant: 'warn' as const, label: 'Decide' }
                        : { variant: 'secondary' as const, label: 'Pending' };
                return (
                  <button
                    key={c.tournamentId}
                    role="option"
                    aria-selected={c.tournamentId === selected?.tournamentId}
                    onClick={() => setSelectedId(c.tournamentId)}
                    className={`flex flex-col gap-1 p-4 text-left ${c.tournamentId === selected?.tournamentId ? 'bg-sidebar-accent' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">0{c.rank}</span>
                      <span className="font-medium">{c.name}</span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.tier ?? 'Tier n/a'} · {c.surface ?? 'Surface n/a'} · {c.startDate} –{' '}
                      {c.endDate}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={
                          days != null && days <= 10 ? 'text-warn' : 'text-muted-foreground'
                        }
                      >
                        {days != null ? `closes in ${days}d` : 'no deadline set'}
                      </span>
                      {!isFree && (
                        <span className="font-mono text-muted-foreground">
                          {c.ratio.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {snapshot && snapshot.excluded.length > 0 && (
              <details className="border-t border-border p-4 text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Also considered · {snapshot.excluded.length} excluded
                </summary>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                  {snapshot.excluded.map((e) => (
                    <li key={e.tournamentId} className="flex justify-between gap-2">
                      <span>{e.name}</span>
                      <span>{e.reason.replace(/_/g, ' ')}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          <Card className="p-5">
            {selected && (
              <DetailPanel
                playerId={playerId}
                homeCurrency={homeCurrency}
                candidate={selected}
                reserves={snapshot?.reserves ?? 0}
                netBurn={snapshot?.netBurn ?? 0}
                isFree={isFree}
                unit={unit}
                onUnitChange={handleUnitChange}
                equipmentMainsKg={snapshot?.equipmentMainsKg ?? 24}
                equipmentCrossesKg={snapshot?.equipmentCrossesKg ?? 23}
                onDone={load}
                onStartTrial={handleStartTrial}
                onToast={showToast}
              />
            )}
          </Card>
        </div>
      ) : (
        <div className="mt-4">
          <CalendarTab
            candidates={candidates}
            blockedWeekStarts={blockedWeekStartsFor(blockedDates, now)}
            now={now}
          />
        </div>
      )}

      {isFree && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-border p-4 text-sm">
          <span className="text-muted-foreground">
            Pro adds cost, outcomes and runway effect to every candidate.
          </span>
          <Button size="sm" onClick={handleStartTrial}>
            Start Pro trial
          </Button>
        </div>
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
