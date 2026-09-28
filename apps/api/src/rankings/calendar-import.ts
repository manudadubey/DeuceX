import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@deucex/db';
import type { CalendarRow } from './calendar-csv';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type TournamentWrite = Database['public']['Tables']['tournaments']['Insert'];

// An event is the same event when tour, name (case-insensitive) and start date
// match: re-importing next week's sheet updates rows instead of duplicating them.
function keyOf(tour: string, name: string, startDate: string): string {
  return `${tour}|${name.trim().toLowerCase()}|${startDate}`;
}

function toWrite(row: CalendarRow): TournamentWrite {
  return {
    tour: row.tour,
    name: row.name,
    tier: row.tier,
    surface: row.surface,
    indoor_outdoor: row.indoorOutdoor,
    city: row.city,
    country: row.country,
    lat: row.lat,
    lon: row.lon,
    altitude_m: row.altitudeM,
    start_date: row.startDate,
    end_date: row.endDate,
    entry_deadline: row.entryDeadline,
    last_year_cut: row.lastYearCut,
    ball: row.ball,
    prize_currency: row.prizeCurrency,
    prize_table: row.prizeTable as Json,
    points_table: row.pointsTable as Json,
  };
}

const COMPARED: (keyof TournamentWrite)[] = [
  'tier',
  'surface',
  'indoor_outdoor',
  'city',
  'country',
  'lat',
  'lon',
  'altitude_m',
  'end_date',
  'entry_deadline',
  'last_year_cut',
  'ball',
  'prize_currency',
  'prize_table',
  'points_table',
];

// jsonb stores object keys in its own order and numeric columns come back as
// strings, so compare by value: numbers as numbers, objects key by key.
function canonical(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

function same(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export interface CalendarPlanEntry {
  action: 'new' | 'update' | 'unchanged';
  existingId: string | null;
  name: string;
  tour: string;
  tier: string;
  startDate: string;
  entryDeadline: string | null;
  changedFields: string[];
}

export interface CalendarPlan {
  entries: CalendarPlanEntry[];
  newCount: number;
  updateCount: number;
  unchangedCount: number;
}

async function loadExisting(
  db: SupabaseClient<Database>,
  rows: readonly CalendarRow[],
): Promise<Map<string, TournamentRow>> {
  const starts = [...new Set(rows.map((r) => r.startDate))];
  const existing = new Map<string, TournamentRow>();
  if (starts.length === 0) return existing;
  const { data, error } = await db.from('tournaments').select('*').in('start_date', starts);
  if (error) throw error;
  for (const t of data ?? []) existing.set(keyOf(t.tour, t.name, t.start_date), t);
  return existing;
}

export async function previewCalendarImport(
  db: SupabaseClient<Database>,
  rows: readonly CalendarRow[],
): Promise<CalendarPlan> {
  const existing = await loadExisting(db, rows);
  const seen = new Set<string>();
  const entries: CalendarPlanEntry[] = [];
  for (const row of rows) {
    const key = keyOf(row.tour, row.name, row.startDate);
    if (seen.has(key)) continue; // a repeated line in the same file counts once
    seen.add(key);
    const current = existing.get(key);
    const write = toWrite(row);
    const changedFields = current
      ? COMPARED.filter((f) => !same(current[f as keyof TournamentRow], write[f]))
      : [];
    entries.push({
      action: !current ? 'new' : changedFields.length ? 'update' : 'unchanged',
      existingId: current?.id ?? null,
      name: row.name,
      tour: row.tour,
      tier: row.tier,
      startDate: row.startDate,
      entryDeadline: row.entryDeadline,
      changedFields,
    });
  }
  return {
    entries,
    newCount: entries.filter((e) => e.action === 'new').length,
    updateCount: entries.filter((e) => e.action === 'update').length,
    unchangedCount: entries.filter((e) => e.action === 'unchanged').length,
  };
}

export interface CalendarImportResult extends CalendarPlan {
  /** Ids of every event inserted or updated, for re-running the shortlists they touch. */
  touchedIds: string[];
}

export async function applyCalendarImport(
  db: SupabaseClient<Database>,
  rows: readonly CalendarRow[],
): Promise<CalendarImportResult> {
  const plan = await previewCalendarImport(db, rows);
  const byKey = new Map(rows.map((r) => [keyOf(r.tour, r.name, r.startDate), r]));
  const touchedIds: string[] = [];
  for (const entry of plan.entries) {
    if (entry.action === 'unchanged') continue;
    const row = byKey.get(keyOf(entry.tour, entry.name, entry.startDate))!;
    const write = toWrite(row);
    if (entry.action === 'new') {
      const { data, error } = await db.from('tournaments').insert(write).select('id').single();
      if (error) throw error;
      touchedIds.push(data.id);
    } else {
      const { error } = await db
        .from('tournaments')
        .update({ ...write, updated_at: new Date().toISOString() })
        .eq('id', entry.existingId!);
      if (error) throw error;
      touchedIds.push(entry.existingId!);
    }
  }
  return { ...plan, touchedIds };
}
