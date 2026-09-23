import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from '@procircuit/ui';
import type { TournamentCandidateView } from '@/lib/tournament/load';

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function fmt(date: Date): string {
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const WEEKS_SHOWN = 8;

// PRD-01 section 4.1's Calendar tab: eight week columns (current week
// first), one row per shortlisted event, a bar in the event week, a
// deadline marker in the deadline week when undecided, blocked weeks
// shaded. Rendered as a table rather than the prototype's own CSS grid —
// same information, a plainer implementation.
export function CalendarTab({
  candidates,
  blockedWeekStarts,
  now = new Date(),
}: {
  candidates: TournamentCandidateView[];
  blockedWeekStarts: string[];
  now?: Date;
}) {
  const firstMonday = mondayOf(now);
  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, i) => addDays(firstMonday, i * 7));
  const weekIso = weeks.map((w) => w.toISOString().slice(0, 10));

  return (
    <TableWrap>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Event</TableHead>
            {weeks.map((w, i) => (
              <TableHead
                key={weekIso[i]}
                className={
                  blockedWeekStarts.includes(weekIso[i]!) ? 'bg-sidebar-accent' : undefined
                }
              >
                {fmt(w)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.map((c) => (
            <TableRow key={c.tournamentId}>
              <TableCell>{c.name}</TableCell>
              {weekIso.map((iso) => {
                const isEventWeek = c.weekStart === iso;
                const isDeadlineWeek =
                  c.status === 'none' &&
                  c.entryDeadline &&
                  c.entryDeadline.slice(0, 10) >= iso &&
                  c.entryDeadline.slice(0, 10) <
                    addDays(new Date(iso), 7).toISOString().slice(0, 10);
                return (
                  <TableCell
                    key={iso}
                    className={blockedWeekStarts.includes(iso) ? 'bg-sidebar-accent' : undefined}
                  >
                    {isEventWeek && (
                      <Badge variant="secondary">
                        {c.tier ?? 'Event'}
                        {c.defendPoints ? ` · def ${c.defendPoints}` : ''}
                      </Badge>
                    )}
                    {!isEventWeek && isDeadlineWeek && (
                      <span className="text-xs text-warn">closes {c.entryDeadline}</span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableWrap>
  );
}
