import pg from 'pg';

// The admin console's only way into the database (TECH-ARCHITECTURE.md 2.4,
// PRD-13 AD-6). Every connection in this pool switches to the `console`
// role the moment it opens and never leaves it, so the step 5.1 migration's
// explicit column grants bound every console query: one that reaches for
// notes.transcript fails with a permission error instead of relying on the
// screen not asking for it. The connecting user (SUPABASE_DB_URL's postgres
// user) is a member of `console`, which is what makes `set role` legal. The
// pool is the console's alone; nothing else ever borrows these connections.
//
// Setting the role per connection rather than per transaction is a speed
// choice: the database is a round trip away (the Tokyo session pooler), and
// begin, set role and commit around every read cost three extra round trips
// per request. Reads now run straight on the pool, two at a time; writes
// still run in a transaction.

export interface ConsoleQuery {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

export interface ConsoleDb {
  /** Runs `fn` in one transaction as the console role; commits on success, rolls back on throw. */
  tx<T>(fn: (q: ConsoleQuery) => Promise<T>): Promise<T>;
  /** Read-only: each query runs on its own pooled connection (as the console role), in parallel up to the pool size. */
  read<T>(fn: (q: ConsoleQuery) => Promise<T>): Promise<T>;
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
  // Queued ahead of anything else on the new connection, so no query can
  // run before the role is set.
  pool.on('connect', (client) => {
    client
      .query('set role console')
      .catch(() => client.release(new Error('set role console failed')));
  });

  return {
    read(fn) {
      return fn({ query: (text, params) => pool.query(text, params) as never });
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
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
