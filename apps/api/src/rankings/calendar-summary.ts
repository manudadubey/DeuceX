import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';

// What the Tournament calendar import card shows before anything is pasted:
// what's in the calendar now and when it was last imported, so staff can
// tell at a glance whether an import is due (the prototype's own "Last
// import: … · rows" line on the snapshot drop zone).

export interface CalendarSummary {
  /** Events that haven't finished yet (end date today or later, UTC). */
  upcomingCount: number;
  byTour: { tour: string; count: number }[];
  firstStart: string | null;
  lastStart: string | null;
  /** The soonest entry deadline still ahead, and how many events close on it. */
  nextDeadline: { date: string; count: number } | null;
  missingDeadlineCount: number;
  lastImport: {
    at: string;
    by: string | null;
    newCount: number | null;
    updateCount: number | null;
  } | null;
}

const TOUR_ORDER = ['atp', 'wta', 'itf_men', 'itf_women'];

export async function calendarSummary(
  db: SupabaseClient<Database>,
  today = new Date().toISOString().slice(0, 10),
): Promise<CalendarSummary> {
  const [events, audit] = await Promise.all([
    db.from('tournaments').select('tour, start_date, entry_deadline').gte('end_date', today),
    db
      .from('admin_actions')
      .select('created_at, admin_name, target')
      .eq('action_type', 'calendar_import')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  if (events.error) throw events.error;
  if (audit.error) throw audit.error;
  const rows = events.data ?? [];

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.tour, (counts.get(r.tour) ?? 0) + 1);
  const byTour = [...counts]
    .map(([tour, count]) => ({ tour, count }))
    .sort((a, b) => TOUR_ORDER.indexOf(a.tour) - TOUR_ORDER.indexOf(b.tour));

  const starts = rows.map((r) => r.start_date).sort();
  const deadlines = rows
    .map((r) => r.entry_deadline)
    .filter((d): d is string => d !== null && d >= today)
    .sort();
  const next = deadlines[0];

  const last = audit.data?.[0];
  const target = (last?.target ?? {}) as { newCount?: number; updateCount?: number };
  return {
    upcomingCount: rows.length,
    byTour,
    firstStart: starts[0] ?? null,
    lastStart: starts.at(-1) ?? null,
    nextDeadline: next ? { date: next, count: deadlines.filter((d) => d === next).length } : null,
    missingDeadlineCount: rows.filter((r) => r.entry_deadline === null).length,
    lastImport: last
      ? {
          at: last.created_at,
          by: last.admin_name,
          newCount: target.newCount ?? null,
          updateCount: target.updateCount ?? null,
        }
      : null,
  };
}
