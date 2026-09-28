'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Ban, RefreshCw, Wallet } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardDescription,
  CardHeader,
  CardTitle,
  Flag,
  Stat,
  StatLabel,
  StatSub,
  StatValue,
  StatsRow,
  Toast,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  buttonVariants,
  cn,
} from '@deucex/ui';
import { parseBlockedDateRanges, type Unit } from '@deucex/agents';
import { updateUnits, type Units } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';
import { daysUntil, loadTournamentSnapshot, type TournamentSnapshot } from '@/lib/tournament/load';
import { RerunLimitError, rerunTournamentAgent } from '@/lib/tournament/api';
import {
  dateRange,
  dayLabel,
  flagFor,
  isoWeek,
  nextSunday,
  runStamp,
  surfaceLabel,
} from '@/lib/tournament/format';
import { CalendarTab } from '@/components/tournament/calendar-tab';
import { DetailPanel } from '@/components/tournament/detail-panel';
import { PausedNotice } from '@/components/agents/paused-notice';
import { StartTrialButton } from '@/components/billing/start-trial-button';

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

const HOUR_MS = 60 * 60 * 1000;

// Plain-language reasons for "Also considered" (the engine's codes, T-2).
const EXCLUSION_REASONS: Record<string, string> = {
  blocked_dates: 'Clashes with your blocked dates',
  over_budget: 'Over your weekly budget',
  outside_acceptance_cut: "Outside last year's cut, no qualifying",
  surface_excluded: "A surface you've excluded",
  week_clash: 'Same week as a better pick',
  ranked_outside_top_five: 'Ranked outside the top five',
};

function clock(d: Date): string {
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatBudget(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
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
  const [rerunning, setRerunning] = useState(false);
  const [rerunAvailableAt, setRerunAvailableAt] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
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
  const deadlineThisWeek = candidates
    .filter((c) => {
      const days = daysUntil(c.entryDeadline, now);
      return c.status === 'none' && days != null && days <= 7 && days >= 0;
    })
    .sort((a, b) => (a.entryDeadline ?? '').localeCompare(b.entryDeadline ?? ''));
  const decidedCount = candidates.filter((c) => c.status !== 'none').length;
  const enteredCount = candidates.filter((c) => c.status === 'entered').length;
  const skippedCount = candidates.filter(
    (c) => c.status === 'skipped' || c.status === 'withdrawn',
  ).length;
  const blockedCount = parseBlockedDateRanges(blockedDates, now).length;
  const weeks = candidates.map((c) => isoWeek(c.startDate));
  // T-AC-9: one manual re-run an hour, from the server's answer or the last manual run.
  const rerunFreeAt = rerunAvailableAt
    ? new Date(rerunAvailableAt)
    : snapshot?.lastManualRunAt
      ? new Date(new Date(snapshot.lastManualRunAt).getTime() + HOUR_MS)
      : null;
  const rerunBlocked = rerunFreeAt != null && rerunFreeAt.getTime() > now.getTime();

  const selectRow = (id: string) => {
    setSelectedId(id);
    // T-AC-13: on narrow screens the detail sits below the list; bring it into view.
    if (window.matchMedia('(max-width: 1180px)').matches) {
      // After the new detail renders; a timeout, not requestAnimationFrame,
      // which browsers pause in a tab that isn't in front.
      setTimeout(
        () => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        50,
      );
    }
  };

  const handleRerun = async () => {
    setRerunning(true);
    try {
      const { availableAt } = await rerunTournamentAgent(supabase);
      setRerunAvailableAt(availableAt);
      showToast('Re-run queued · results in about 2 minutes');
      // T-13: replace the list in place when the run lands; decisions persist server-side.
      const started = Date.now();
      const poll = setInterval(async () => {
        const data = await loadTournamentSnapshot(supabase, playerId, homeCurrency, weeklyBudget);
        if ((data.ranAt ?? '') > (snapshot?.ranAt ?? '') || Date.now() - started > 3 * 60 * 1000) {
          clearInterval(poll);
          setSnapshot(data);
          setRerunning(false);
        }
      }, 5000);
    } catch (err) {
      setRerunning(false);
      if (err instanceof RerunLimitError) {
        setRerunAvailableAt(err.availableAt);
        showToast(`One re-run an hour. Next at ${clock(new Date(err.availableAt))}`);
      } else {
        showToast("Couldn't queue a re-run. Try again.");
      }
    }
  };

  return (
    <ToastProvider>
      <header className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tournament Agent</h1>
          <p className="text-sm text-muted-foreground">
            Weekly shortlist
            {weeks.length ? ` for weeks ${Math.min(...weeks)}–${Math.max(...weeks)}` : ''}, ranked
            by cost-to-prize.
            {snapshot?.ranAt ? ` Ran ${runStamp(snapshot.ranAt)} UTC` : ' Not run yet'} · next run{' '}
            {nextSunday(now)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/settings" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Wallet aria-hidden="true" className="size-4" />
            {weeklyBudget != null
              ? `Budget ${formatBudget(weeklyBudget, homeCurrency)}/wk`
              : 'Set a weekly budget'}
          </Link>
          <Link href="/settings" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Ban aria-hidden="true" className="size-4" />
            Blocked dates
            <Badge variant="secondary" className="ml-0.5 tabular-nums">
              {blockedCount}
            </Badge>
          </Link>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="sm"
                  onClick={() => void handleRerun()}
                  disabled={rerunning || rerunBlocked}
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={cn('size-4', rerunning && 'motion-safe:animate-spin')}
                  />
                  {rerunning ? 'Re-running…' : 'Re-run now'}
                </Button>
              </span>
            </TooltipTrigger>
            {rerunBlocked && rerunFreeAt && (
              <TooltipContent>
                One re-run an hour. Available again at {clock(rerunFreeAt)}.
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </header>
      <PausedNotice agent="tournament" label="The Tournament Agent" />

      {loaded && (
        <StatsRow aria-label="Run summary">
          <Stat>
            <StatLabel>Events scanned</StatLabel>
            <StatValue>{snapshot?.scannedCount ?? 0}</StatValue>
            <StatSub>
              In your stage&apos;s scope
              {weeks.length ? ` · wk ${Math.min(...weeks)}–${Math.max(...weeks)}` : ''}
            </StatSub>
          </Stat>
          <Stat>
            <StatLabel>Shortlisted</StatLabel>
            <StatValue>{candidates.length}</StatValue>
            <StatSub>within budget, no blocked dates</StatSub>
          </Stat>
          <Stat>
            <StatLabel>Deadline this week</StatLabel>
            <StatValue className={deadlineThisWeek.length > 0 ? 'text-warn' : undefined}>
              {deadlineThisWeek.length}
            </StatValue>
            <StatSub>
              {deadlineThisWeek[0]
                ? `${deadlineThisWeek[0].city ?? deadlineThisWeek[0].name} · ${dayLabel(deadlineThisWeek[0].entryDeadline!)}`
                : 'none'}
            </StatSub>
          </Stat>
          <Stat>
            <StatLabel>Decisions</StatLabel>
            <StatValue
              className={
                candidates.length > 0 && decidedCount === candidates.length ? 'text-ok' : undefined
              }
            >
              {decidedCount} <small>of {candidates.length}</small>
            </StatValue>
            <StatSub>
              {decidedCount === 0
                ? 'nothing entered yet'
                : `${enteredCount} entered · ${skippedCount} skipped`}
            </StatSub>
          </Stat>
        </StatsRow>
      )}

      <ToggleGroup
        type="single"
        variant="segmented"
        value={view}
        onValueChange={(v) => v && setView(v as View)}
        aria-label="View"
        className="mt-4"
      >
        <ToggleGroupItem value="list">Shortlist</ToggleGroupItem>
        <ToggleGroupItem value="cal">Calendar</ToggleGroupItem>
      </ToggleGroup>

      {!loaded ? null : candidates.length === 0 ? (
        <Card className="mt-4 p-6 text-sm text-muted-foreground">
          No shortlist yet.{' '}
          {snapshot?.ranAt
            ? `The last run (${runStamp(snapshot.ranAt)} UTC) found no events in your stage's scope within budget and outside your blocked dates.`
            : 'The first run happens Sunday 20:00 UTC, or use Re-run now.'}
        </Card>
      ) : view === 'list' ? (
        <div className="mt-4 grid grid-cols-[5fr_7fr] items-start gap-4 max-[1180px]:grid-cols-1">
          <Card className="gap-0 py-3">
            <div role="listbox" aria-label="Shortlist" className="flex flex-col gap-0.5 px-3">
              {candidates.map((c) => {
                const days = daysUntil(c.entryDeadline, now);
                const hot = c.status === 'none' && days != null && days <= 10;
                const badge =
                  c.status === 'entered'
                    ? { variant: 'ok' as const, label: 'Entered', dot: true }
                    : c.status === 'skipped' || c.status === 'withdrawn'
                      ? { variant: 'secondary' as const, label: 'Skipped', dot: false }
                      : hot
                        ? { variant: 'warn' as const, label: 'Decide', dot: true }
                        : { variant: 'secondary' as const, label: 'Pending', dot: false };
                const flag = flagFor(c.country, c.city);
                const isSelected = c.tournamentId === selected?.tournamentId;
                return (
                  <button
                    key={c.tournamentId}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectRow(c.tournamentId)}
                    className={cn(
                      'grid w-full grid-cols-[1.375rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 rounded-xl p-3 text-left hover:bg-accent',
                      isSelected && 'bg-surface shadow-[0_0_0_1px_var(--border)] hover:bg-surface',
                    )}
                  >
                    <span className="row-span-3 font-mono text-xs text-muted-foreground">
                      {String(c.rank).padStart(2, '0')}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                      {flag && <Flag code={flag} />}
                      <span className="truncate">{c.name}</span>
                    </span>
                    <Badge variant={badge.variant} className="justify-self-end">
                      {badge.dot && (
                        <i className="mr-1 inline-block size-1.5 rounded-full bg-current" />
                      )}
                      {badge.label}
                    </Badge>
                    <span className="col-start-2 truncate text-xs text-muted-foreground">
                      {[c.tier, surfaceLabel(c.surface), dateRange(c.startDate, c.endDate)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span
                      className={cn(
                        'col-start-3 text-right text-xs whitespace-nowrap',
                        hot ? 'font-medium text-warn' : 'text-muted-foreground',
                      )}
                    >
                      {days == null
                        ? 'no deadline'
                        : days < 0
                          ? 'entry closed'
                          : `closes in ${days}d`}
                    </span>
                    <span className="col-span-2 col-start-2 mt-1.5 grid grid-cols-[1fr_auto] items-center gap-2 text-[0.6875rem] text-muted-foreground">
                      {isFree ? (
                        <>
                          <i className="block h-1.5 rounded-full bg-muted" />
                          <span>Pro</span>
                        </>
                      ) : (
                        <>
                          <i className="block h-1.5 overflow-hidden rounded-full bg-muted">
                            <b
                              className={cn(
                                'block h-full rounded-full',
                                c.ratio > 0.7 ? 'bg-muted-foreground' : 'bg-chart-2',
                              )}
                              style={{ width: `${Math.max(0, Math.round((1 - c.ratio) * 100))}%` }}
                            />
                          </i>
                          <span className="font-mono text-foreground">{c.ratio.toFixed(2)}</span>
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            {snapshot && snapshot.excluded.length > 0 && (
              <details className="mx-3 mt-2 border-t border-border pt-2">
                <summary className="cursor-pointer px-3 py-2 text-[0.8125rem] text-muted-foreground">
                  Also considered · {snapshot.excluded.length} excluded
                </summary>
                <ul className="flex flex-col gap-1.5 px-3 pb-2 text-[0.8125rem]">
                  {snapshot.excluded.map((e) => (
                    <li key={e.tournamentId} className="flex justify-between gap-3">
                      <span>{e.name}</span>
                      <span className="text-right text-muted-foreground">
                        {EXCLUSION_REASONS[e.reason] ?? e.reason.replace(/_/g, ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          <div ref={detailRef} className="sticky top-[4.5rem] scroll-mt-20 max-[1180px]:static">
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
                  onToast={showToast}
                />
              )}
            </Card>
          </div>
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

      {loaded && snapshot?.memo && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Recommendation memo</CardTitle>
            <CardDescription>
              Written by the agent after this run from the shortlist&apos;s own figures, and checked
              so every amount, points figure and date matches them.
            </CardDescription>
            <CardActions>
              <Badge variant="secondary">{runStamp(snapshot.memo.createdAt)} UTC</Badge>
            </CardActions>
          </CardHeader>
          <div className="flex max-w-[70ch] flex-col gap-3 px-6 text-[0.9375rem] leading-relaxed">
            {snapshot.memo.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </Card>
      )}

      {isFree && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-border p-4 text-sm">
          <span className="text-muted-foreground">
            Pro adds cost, outcomes and runway effect to every candidate.
          </span>
          <StartTrialButton size="sm" onToast={showToast} />
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
