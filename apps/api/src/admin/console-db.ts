import pg from 'pg';

// The admin console's only way into the database (TECH-ARCHITECTURE.md 2.4,
// PRD-13 AD-6). Every console query runs inside a transaction that first
// switches to the `console` role, so the step 5.1 migration's explicit
// column grants are what bound it: a query that reaches for
// notes.transcript fails with a permission error instead of relying on the
// screen not asking for it. The connecting user (SUPABASE_DB_URL's postgres
// user) is a member of `console`, which is what makes `set local role`
// legal; `local` means the role ends with the transaction, so a pooled
// connection never leaks it.

export interface ConsoleQuery {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

export interface ConsoleDb {
  /** Runs `fn` in one transaction as the console role; commits on success, rolls back on throw. */
  tx<T>(fn: (q: ConsoleQuery) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

// Timestamps leave this module as ISO strings, never Date objects: the read
// models sort and compare them as strings and send them straight to JSON.
// Scoped to this pool, so pg-boss's own connections are untouched.
const TIMESTAMPTZ = 1184;
const TIMESTAMP = 1114;
function getTypeParser(oid: number, format?: string) {
  if (oid === TIMESTAMPTZ || oid === TIMESTAMP) {
    return (value: string) => {
      // Postgres text form ("2026-09-23 09:59:54.207+00") into strict ISO 8601.
      const iso = value.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
      return new Date(oid === TIMESTAMP ? `${iso}Z` : iso).toISOString();
    };
  }
  return pg.types.getTypeParser(oid, format as 'text');
}

export function createConsoleDb(connectionString: string): ConsoleDb {
  // Two connections: the session pooler caps this project at 15 clients and
  // the pg-boss instances already hold most of them (money/queue.ts).
  const pool = new pg.Pool({ connectionString, max: 2, types: { getTypeParser } });

  return {
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('set local role console');
        // Queries issued in parallel (Promise.all in the read models) run
        // one after another on this transaction's single connection.
        let chain: Promise<unknown> = Promise.resolve();
        const q: ConsoleQuery = {
          query(text, params) {
            const next = chain.then(() => client.query(text, params));
            chain = next.catch(() => undefined);
            return next as never;
          },
        };
        const result = await fn(q);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}
