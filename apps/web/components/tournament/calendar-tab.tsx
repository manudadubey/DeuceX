import { Card, CardActions, CardDescription, CardHeader, CardTitle, Flag, cn } from '@deucex/ui';
import type { TournamentCandidateView } from '@/lib/tournament/load';
import { flagFor, isoWeek } from '@/lib/tournament/format';

const WEEKS_SHOWN = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday of the week containing the viewer's own local today, as a UTC-midnight date. */
function currentMonday(now: Date): Date {
  // The viewer's local calendar date, not UTC's: on a Monday morning in
  // Australia it is still Sunday in UTC, which put last week first.
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const diff = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - diff * DAY_MS);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function short(d: Date): string {
  return d
    .toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace('Sept', 'Sep');
}

const STRIPES = 'bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,transparent_6px_12px)]';

// PRD-01 section 4.1 / T-17, the prototype's `.cal`: eight week columns,
// current week first; one row per shortlisted event with a bar in its week
// (entered, skipped and defence weeks styled apart); a deadline dot in the
// deadline week while undecided; blocked weeks striped; a final Blocked row.
export function CalendarTab({
  candidates,
  blockedWeekStarts,
  now = new Date(),
}: {
  candidates: TournamentCandidateView[];
  blockedWeekStarts: string[];
  now?: Date;
}) {
  const first = currentMonday(now);
  const weeks = Array.from(
    { length: WEEKS_SHOWN },
    (_, i) => new Date(first.getTime() + i * 7 * DAY_MS),
  );
  const weekIso = weeks.map(iso);
  const blocked = new Set(blockedWeekStarts);
  const grid = 'grid grid-cols-[10rem_repeat(8,minmax(4.5rem,1fr))]';

  const row = (key: string, label: React.ReactNode, cells: React.ReactNode[]) => (
    <div key={key} className={cn(grid, 'gap-y-1.5')}>
      <div className="self-center px-1.5 py-2 text-[0.8125rem] font-medium">{label}</div>
      {cells}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next 8 weeks</CardTitle>
        <CardDescription>
          Tournament weeks, entry deadlines and points you&apos;re defending.
        </CardDescription>
        <CardActions>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2.5 rounded-sm bg-chart-2" />
              Shortlisted
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2.5 rounded-full bg-warn" />
              Entry closes
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2.5 rounded-sm bg-muted" />
              Blocked
            </span>
          </div>
        </CardActions>
      </CardHeader>
      <div className="overflow-x-auto px-6">
        <div className="flex min-w-[45rem] flex-col text-xs">
          <div className={grid}>
            <div className="border-b border-border" />
            {weeks.map((w, i) => (
              <div
                key={weekIso[i]}
                className="border-b border-border px-1.5 pb-2 text-muted-foreground"
              >
                <b
                  className={cn(
                    'block font-mono font-medium text-foreground',
                    i === 0 && 'text-chart-2',
                  )}
                >
                  wk {isoWeek(weekIso[i]!)}
                </b>
                {short(w)}
              </div>
            ))}
          </div>

          {candidates.map((c) => {
            const flag = flagFor(c.country, c.city);
            const skipped = c.status === 'skipped' || c.status === 'withdrawn';
            return row(
              c.tournamentId,
              <>
                <span className="flex items-center gap-1.5">
                  {flag && <Flag code={flag} />}
                  <span className="truncate">{c.name}</span>
                </span>
                {c.city && (
                  <small className="block text-xs font-normal text-muted-foreground">
                    {c.city}
                  </small>
                )}
              </>,
              weekIso.map((week) => {
                const weekEnd = iso(new Date(new Date(`${week}T00:00:00Z`).getTime() + 7 * DAY_MS));
                const isEventWeek = c.startDate >= week && c.startDate < weekEnd;
                const isDeadlineWeek =
                  c.status === 'none' &&
                  !!c.entryDeadline &&
                  c.entryDeadline >= week &&
                  c.entryDeadline < weekEnd;
                return (
                  <div
                    key={week}
                    className={cn(
                      'relative min-h-10 border-l border-[var(--chart-grid)]',
                      blocked.has(week) && STRIPES,
                    )}
                  >
                    {isEventWeek ? (
                      <div
                        title={c.name}
                        className={cn(
                          'absolute inset-x-1 inset-y-2 flex items-center overflow-hidden rounded-md px-2 font-medium whitespace-nowrap',
                          c.status === 'entered'
                            ? 'bg-foreground text-background'
                            : skipped
                              ? 'bg-muted text-muted-foreground line-through'
                              : c.defendPoints
                                ? 'bg-warn-bg text-warn shadow-[inset_0_0_0_1px_var(--warn)]'
                                : 'bg-chart-2 text-[oklch(0.2_0.05_131)]',
                        )}
                      >
                        {c.tier ?? 'Event'}
                        {c.defendPoints ? ` · def ${c.defendPoints}` : ''}
                      </div>
                    ) : isDeadlineWeek ? (
                      <span className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
                        <i className="size-2.5 rounded-full bg-warn shadow-[0_0_0_2px_var(--card)]" />
                        <span className="mt-1 text-[0.625rem] whitespace-nowrap text-muted-foreground">
                          closes {short(new Date(`${c.entryDeadline}T00:00:00Z`))}
                        </span>
                      </span>
                    ) : null}
                  </div>
                );
              }),
            );
          })}

          {row(
            'blocked',
            <>
              Blocked
              <small className="block text-xs font-normal text-muted-foreground">
                from your blocked dates
              </small>
            </>,
            weekIso.map((week) => (
              <div
                key={week}
                className={cn(
                  'relative min-h-10 border-l border-[var(--chart-grid)]',
                  blocked.has(week) && STRIPES,
                )}
              >
                {blocked.has(week) && (
                  <div className="absolute inset-x-1 inset-y-2 flex items-center rounded-md bg-muted px-2 text-muted-foreground">
                    Blocked
                  </div>
                )}
              </div>
            )),
          )}
        </div>
      </div>
    </Card>
  );
}
