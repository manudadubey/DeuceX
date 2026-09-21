// A minimal in-memory fake of the slice of the supabase-js query builder
// notes/service.ts and notes/audio-lifecycle.ts actually call
// (.from().select/insert/update/delete().eq/neq/lte/not().single/maybeSingle(),
// plus .rpc()) — not a real PostgREST client. Real filtering and RLS
// behaviour is proven against the live project by
// packages/db/src/rls.integration.test.ts; this exists so the service
// layer's own logic (quota gating, status-transition guards, which rows a
// query should touch) can be tested without a live Postgres connection.
/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>;

class TableQuery implements PromiseLike<{ data: any; error: any }> {
  private filters: Array<(row: Row) => boolean> = [];
  private pendingInsert?: Row;
  private pendingUpdate?: Row;
  private pendingDelete = false;
  private pendingUpsert?: { row: Row; onConflict: string | undefined };
  private orderSpec?: { col: string; ascending: boolean };
  private limitCount?: number;

  constructor(
    private readonly db: FakeDb,
    private readonly tableName: string,
  ) {}

  select(): this {
    return this;
  }

  eq(col: string, value: unknown): this {
    this.filters.push((row) => row[col] === value);
    return this;
  }

  neq(col: string, value: unknown): this {
    this.filters.push((row) => row[col] !== value);
    return this;
  }

  lte(col: string, value: string | number): this {
    // Compares as dates when both sides parse as one (e.g. ISO timestamps
    // with and without milliseconds are equal instants but not equal
    // strings), falling back to a raw comparison otherwise.
    this.filters.push((row) => {
      const left = row[col];
      if (left == null) return false;
      const leftDate = new Date(left as string).getTime();
      const rightDate = new Date(value).getTime();
      if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) return leftDate <= rightDate;
      return left <= value;
    });
    return this;
  }

  gte(col: string, value: string | number): this {
    // Mirrors lte() above: date-aware when both sides parse as one.
    this.filters.push((row) => {
      const left = row[col];
      if (left == null) return false;
      const leftDate = new Date(left as string).getTime();
      const rightDate = new Date(value).getTime();
      if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) return leftDate >= rightDate;
      return left >= value;
    });
    return this;
  }

  lt(col: string, value: string | number): this {
    this.filters.push((row) => {
      const left = row[col];
      if (left == null) return false;
      const leftDate = new Date(left as string).getTime();
      const rightDate = new Date(value).getTime();
      if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) return leftDate < rightDate;
      return left < value;
    });
    return this;
  }

  not(col: string, op: string, value: unknown): this {
    if (op === 'is' && value === null) {
      this.filters.push((row) => row[col] != null);
    }
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderSpec = { col, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  insert(row: Row): this {
    this.pendingInsert = row;
    return this;
  }

  update(patch: Row): this {
    this.pendingUpdate = patch;
    return this;
  }

  // A minimal upsert: matches an existing row on the onConflict columns
  // (comma-separated, matching supabase-js's own string form) and merges
  // over it, or inserts a new row when none matches.
  upsert(row: Row, opts?: { onConflict?: string }): this {
    this.pendingUpsert = { row, onConflict: opts?.onConflict };
    return this;
  }

  delete(): this {
    this.pendingDelete = true;
    return this;
  }

  private matched(): Row[] {
    const table = this.db.tables[this.tableName] ?? [];
    let rows = table.filter((row) => this.filters.every((f) => f(row)));
    if (this.orderSpec) {
      const { col, ascending } = this.orderSpec;
      rows = [...rows].sort((a, b) => {
        if (a[col] === b[col]) return 0;
        const cmp = a[col] < b[col] ? -1 : 1;
        return ascending ? cmp : -cmp;
      });
    }
    if (this.limitCount !== undefined) rows = rows.slice(0, this.limitCount);
    return rows;
  }

  private async resolve(): Promise<{ data: any; error: any }> {
    if (this.pendingInsert) {
      const row = { id: `row-${Math.random().toString(36).slice(2)}`, ...this.pendingInsert };
      (this.db.tables[this.tableName] ??= []).push(row);
      return { data: [row], error: null };
    }
    if (this.pendingUpsert) {
      const { row: patch, onConflict } = this.pendingUpsert;
      const conflictCols = (onConflict ?? 'id').split(',');
      const table = (this.db.tables[this.tableName] ??= []);
      const existing = table.find((row) => conflictCols.every((col) => row[col] === patch[col]));
      if (existing) {
        Object.assign(existing, patch);
        return { data: [existing], error: null };
      }
      const row = { id: `row-${Math.random().toString(36).slice(2)}`, ...patch };
      table.push(row);
      return { data: [row], error: null };
    }
    if (this.pendingUpdate) {
      const matched = this.matched();
      for (const row of matched) Object.assign(row, this.pendingUpdate);
      return { data: matched, error: null };
    }
    if (this.pendingDelete) {
      const matched = this.matched();
      this.db.tables[this.tableName] = (this.db.tables[this.tableName] ?? []).filter(
        (row) => !matched.includes(row),
      );
      return { data: matched, error: null };
    }
    return { data: this.matched(), error: null };
  }

  async single(): Promise<{ data: any; error: any }> {
    const { data, error } = await this.resolve();
    if (error) return { data: null, error };
    const rows = data as Row[];
    if (rows.length !== 1) return { data: null, error: new Error('expected exactly one row') };
    return { data: rows[0], error: null };
  }

  async maybeSingle(): Promise<{ data: any; error: any }> {
    const { data, error } = await this.resolve();
    if (error) return { data: null, error };
    const rows = data as Row[];
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.resolve().then(onfulfilled, onrejected);
  }
}

export class FakeDb {
  tables: Record<string, Row[]>;
  private rpcHandlers: Record<string, (args: any) => { data: any; error: any }> = {
    notes_saved_this_month_for: ({ p_player_id }) => {
      const notes = this.tables.notes ?? [];
      const count = notes.filter(
        (note) => note.player_id === p_player_id && note.status === 'saved',
      ).length;
      return { data: count, error: null };
    },
  };

  constructor(seed: { notes?: Row[]; players?: Row[] } = {}) {
    this.tables = {
      notes: seed.notes ? [...seed.notes] : [],
      players: seed.players ? [...seed.players] : [],
    };
  }

  from(table: string): TableQuery {
    this.tables[table] ??= [];
    return new TableQuery(this, table);
  }

  async rpc(name: string, args: Row = {}): Promise<{ data: any; error: any }> {
    const handler = this.rpcHandlers[name];
    if (!handler) throw new Error(`No fake rpc handler registered for ${name}`);
    return handler(args);
  }
}

export function makeNote(overrides: Row = {}): Row {
  return {
    id: 'note-1',
    player_id: 'player-1',
    ctx: 'match',
    recorded_at: '2026-09-11T18:42:00Z',
    dur_seconds: 52,
    audio_ref: 'notes/player-1/note-1',
    audio_uploaded_at: '2026-09-11T18:43:00Z',
    audio_deleted_at: null,
    audio_delete_cause: null,
    lang: null,
    lang_conf: null,
    lang_source: null,
    transcript_raw: null,
    transcript: null,
    transcript_confirmed_at: null,
    transcription: null,
    result: null,
    opponent: null,
    round: null,
    surface: null,
    tags: [],
    mood: null,
    summary: null,
    extraction: null,
    edits: [],
    cond: null,
    coach_share: true,
    used: [],
    status: 'review',
    device: null,
    created_at: '2026-09-11T18:43:00Z',
    updated_at: '2026-09-11T18:43:00Z',
    deleted_at: null,
    ...overrides,
  };
}
