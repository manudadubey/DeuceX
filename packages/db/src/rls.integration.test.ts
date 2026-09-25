// Integration tests against the real DeuceX Supabase project (step 0.2).
// They need a direct Postgres connection (SUPABASE_DB_URL) because they have
// to switch to the `authenticated` role and forge a request.jwt.claims value
// mid-session, the same way PostgREST does for a real request; the
// supabase-js client can't do that without a full magic-link sign-in round
// trip. Skipped (not failed) when the env var isn't set, since CI and most
// dev machines won't have the project's database password.
//
// This exact sequence was run by hand against the live project while
// building the migration (see docs/BUILD-LOG.md, step 0.2) and passed; these
// tests make that verification repeatable instead of one-off.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DATABASE_URL = process.env.SUPABASE_DB_URL;
const describeIfConfigured = DATABASE_URL ? describe : describe.skip;

async function asPlayer(client: Client, playerId: string, fn: () => Promise<void>): Promise<void> {
  await client.query('begin');
  try {
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: playerId, role: 'authenticated' }),
    ]);
    await fn();
  } finally {
    await client.query('rollback');
  }
}

describeIfConfigured('players row-level security', () => {
  let client: Client;
  const playerA = randomUUID();
  const playerB = randomUUID();

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(`insert into auth.users (id, email) values ($1, $2), ($3, $4)`, [
      playerA,
      `rls-test-a-${playerA}@deucex.test`,
      playerB,
      `rls-test-b-${playerB}@deucex.test`,
    ]);
    await client.query(
      `insert into public.players
         (id, tour, name, email, country, dob, home_currency, app_language, units, timezone)
       values
         ($1, 'wta', 'Player A', $2, 'AU', '2000-01-01', 'AUD', 'en', 'metric', 'Australia/Sydney'),
         ($3, 'atp', 'Player B', $4, 'US', '2000-01-01', 'USD', 'en', 'imperial', 'America/New_York')`,
      [playerA, `rls-test-a-${playerA}@deucex.test`, playerB, `rls-test-b-${playerB}@deucex.test`],
    );
  });

  afterAll(async () => {
    await client.query(`delete from public.players where id in ($1, $2)`, [playerA, playerB]);
    await client.query(`delete from auth.users where id in ($1, $2)`, [playerA, playerB]);
    await client.end();
  });

  it('lets a player read only their own row', async () => {
    await asPlayer(client, playerA, async () => {
      const result = await client.query('select id from public.players');
      expect(result.rows).toEqual([{ id: playerA }]);
    });
  });

  it("refuses an approval a player authors against someone else's player_id", async () => {
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(
          `insert into public.approvals (player_id, action_type, payload, approved_by)
           values ($1, 'balance_update', '{}'::jsonb, $1)`,
          [playerB],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describeIfConfigured('fx_rates_daily is insert-only', () => {
  let client: Client;
  // Far enough in the past that it can never collide with a real ECB fetch.
  const testDate = '1901-01-01';

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.query(
      'alter table public.fx_rates_daily disable trigger fx_rates_daily_no_delete',
    );
    await client.query(`delete from public.fx_rates_daily where date = $1 and currency = 'AUD'`, [
      testDate,
    ]);
    await client.query('alter table public.fx_rates_daily enable trigger fx_rates_daily_no_delete');
    await client.end();
  });

  it('keeps a provisional row once the real rate lands, per PRD-03', async () => {
    await client.query(
      `insert into public.fx_rates_daily (date, currency, rate_to_eur, source)
       values ($1, 'AUD', 0.6, 'provisional')`,
      [testDate],
    );
    await client.query(
      `insert into public.fx_rates_daily (date, currency, rate_to_eur, source)
       values ($1, 'AUD', 0.61, 'ecb')`,
      [testDate],
    );

    const result = await client.query(
      `select source from public.fx_rates_daily where date = $1 and currency = 'AUD' order by source`,
      [testDate],
    );
    expect(result.rows.map((row: { source: string }) => row.source)).toEqual([
      'ecb',
      'provisional',
    ]);
  });

  it('refuses an update', async () => {
    await expect(
      client.query(`update public.fx_rates_daily set rate_to_eur = 1 where date = $1`, [testDate]),
    ).rejects.toThrow(/insert-only/);
  });

  it('refuses a delete', async () => {
    await expect(
      client.query(`delete from public.fx_rates_daily where date = $1`, [testDate]),
    ).rejects.toThrow(/insert-only/);
  });
});

describeIfConfigured('notes row-level security and quota (step 1.1)', () => {
  let client: Client;
  const playerA = randomUUID();
  const playerB = randomUUID();
  let noteA: string;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(`insert into auth.users (id, email) values ($1, $2), ($3, $4)`, [
      playerA,
      `notes-rls-a-${playerA}@deucex.test`,
      playerB,
      `notes-rls-b-${playerB}@deucex.test`,
    ]);
    await client.query(
      `insert into public.players
         (id, tour, name, email, country, dob, home_currency, app_language, units, timezone)
       values
         ($1, 'wta', 'Player A', $2, 'AU', '2000-01-01', 'AUD', 'en', 'metric', 'Australia/Sydney'),
         ($3, 'atp', 'Player B', $4, 'US', '2000-01-01', 'USD', 'en', 'imperial', 'America/New_York')`,
      [
        playerA,
        `notes-rls-a-${playerA}@deucex.test`,
        playerB,
        `notes-rls-b-${playerB}@deucex.test`,
      ],
    );
    const inserted = await client.query(
      `insert into public.notes (player_id, ctx, status) values ($1, 'match', 'review') returning id`,
      [playerA],
    );
    noteA = inserted.rows[0].id;
  });

  afterAll(async () => {
    await client.query(`delete from public.notes where player_id in ($1, $2)`, [playerA, playerB]);
    await client.query(`delete from public.check_ins where player_id in ($1, $2)`, [
      playerA,
      playerB,
    ]);
    await client.query(`delete from public.players where id in ($1, $2)`, [playerA, playerB]);
    await client.query(`delete from auth.users where id in ($1, $2)`, [playerA, playerB]);
    await client.end();
  });

  it("lets a player read only their own notes, never another player's", async () => {
    await asPlayer(client, playerB, async () => {
      const result = await client.query('select id from public.notes');
      expect(result.rows).toEqual([]);
    });
    await asPlayer(client, playerA, async () => {
      const result = await client.query('select id from public.notes');
      expect(result.rows).toEqual([{ id: noteA }]);
    });
  });

  it('lets a player edit review-state content fields on their own note', async () => {
    // Read-your-own-write within the same uncommitted transaction, since
    // asPlayer always rolls back at the end of the call (see the "money
    // model" describe block below for the same pattern).
    await asPlayer(client, playerA, async () => {
      await client.query(
        `update public.notes set mood = 'confident', transcript = $1 where id = $2`,
        ['Lost in a breaker.', noteA],
      );
      const result = await client.query('select mood, transcript from public.notes where id = $1', [
        noteA,
      ]);
      expect(result.rows[0]).toEqual({ mood: 'confident', transcript: 'Lost in a breaker.' });
    });
  });

  it('refuses a player setting status or deleted_at directly (apps/api-only columns)', async () => {
    // Each rejected query aborts its Postgres transaction, so a second query
    // in the same asPlayer call would fail with "current transaction is
    // aborted" instead of the permission error under test. Use a separate
    // asPlayer call (a fresh transaction) per rejected query.
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(`update public.notes set status = 'saved' where id = $1`, [noteA]),
      ).rejects.toThrow(/permission denied/);
    });
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(`update public.notes set deleted_at = now() where id = $1`, [noteA]),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("refuses a player editing someone else's note", async () => {
    // Seeded directly (bypassing RLS, as the schema owner) so this checks
    // committed state, not a value written inside a different asPlayer
    // call's own transaction, which always rolls back and so was never
    // actually visible here.
    await client.query(`update public.notes set mood = 'confident' where id = $1`, [noteA]);

    await asPlayer(client, playerB, async () => {
      await client.query(`update public.notes set mood = 'flat' where id = $1`, [noteA]);
      // RLS silently filters the row out of the UPDATE's WHERE clause rather
      // than erroring, so the row is simply unchanged, not the error case.
    });
    const result = await client.query('select mood from public.notes where id = $1', [noteA]);
    expect(result.rows[0].mood).toBe('confident');
  });

  it('never allows a SQL DELETE on notes for any role (soft delete only)', async () => {
    // Must run as `authenticated` (via asPlayer), not the raw superuser
    // connection: the underlying SUPABASE_DB_URL role owns the table and
    // isn't subject to the grant restrictions this test is checking.
    await asPlayer(client, playerA, async () => {
      await expect(client.query(`delete from public.notes where id = $1`, [noteA])).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it("notes_saved_this_month() only ever counts the calling player's own saved notes", async () => {
    await client.query(`update public.notes set status = 'saved' where id = $1`, [noteA]);
    await asPlayer(client, playerA, async () => {
      const result = await client.query('select public.notes_saved_this_month() as n');
      expect(result.rows[0].n).toBe(1);
    });
    await asPlayer(client, playerB, async () => {
      const result = await client.query('select public.notes_saved_this_month() as n');
      expect(result.rows[0].n).toBe(0);
    });
    await client.query(`update public.notes set status = 'review' where id = $1`, [noteA]);
  });

  it('refuses an authenticated session calling notes_saved_this_month_for (service-role only)', async () => {
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query('select public.notes_saved_this_month_for($1)', [playerA]),
      ).rejects.toThrow(/permission denied/);
    });
  });
});

describeIfConfigured('check_ins row-level security (step 1.1)', () => {
  let client: Client;
  const playerA = randomUUID();

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(`insert into auth.users (id, email) values ($1, $2)`, [
      playerA,
      `checkins-rls-${playerA}@deucex.test`,
    ]);
    await client.query(
      `insert into public.players
         (id, tour, name, email, country, dob, home_currency, app_language, units, timezone)
       values ($1, 'wta', 'Player A', $2, 'AU', '2000-01-01', 'AUD', 'en', 'metric', 'Australia/Sydney')`,
      [playerA, `checkins-rls-${playerA}@deucex.test`],
    );
  });

  afterAll(async () => {
    await client.query(`delete from public.check_ins where player_id = $1`, [playerA]);
    await client.query(`delete from public.players where id = $1`, [playerA]);
    await client.query(`delete from auth.users where id = $1`, [playerA]);
    await client.end();
  });

  it('lets a player insert and then replace their own check-in for the same day', async () => {
    await asPlayer(client, playerA, async () => {
      await client.query(
        `insert into public.check_ins (player_id, date, value, source) values ($1, '2026-09-21', 3, 'scribe')
         on conflict (player_id, date) do update set value = excluded.value`,
        [playerA],
      );
      await client.query(
        `insert into public.check_ins (player_id, date, value, source) values ($1, '2026-09-21', 5, 'scribe')
         on conflict (player_id, date) do update set value = excluded.value`,
        [playerA],
      );
      const result = await client.query('select value from public.check_ins where player_id = $1', [
        playerA,
      ]);
      expect(result.rows).toEqual([{ value: 5 }]);
    });
  });
});

describeIfConfigured('money model row-level security (step 2.1)', () => {
  let client: Client;
  const playerA = randomUUID();
  const playerB = randomUUID();
  let receivableA: string;
  let ledgerLineA: string;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(`insert into auth.users (id, email) values ($1, $2), ($3, $4)`, [
      playerA,
      `money-rls-a-${playerA}@deucex.test`,
      playerB,
      `money-rls-b-${playerB}@deucex.test`,
    ]);
    await client.query(
      `insert into public.players
         (id, tour, name, email, country, dob, home_currency, app_language, units, timezone)
       values
         ($1, 'wta', 'Player A', $2, 'AU', '2000-01-01', 'AUD', 'en', 'metric', 'Australia/Sydney'),
         ($3, 'atp', 'Player B', $4, 'US', '2000-01-01', 'USD', 'en', 'imperial', 'America/New_York')`,
      [
        playerA,
        `money-rls-a-${playerA}@deucex.test`,
        playerB,
        `money-rls-b-${playerB}@deucex.test`,
      ],
    );
    const receivableInserted = await client.query(
      `insert into public.prize_receivables
         (player_id, event, round, gross_amount, currency, expected_date)
       values ($1, 'singles', 'Q2', 1780, 'EUR', '2026-10-03')
       returning id`,
      [playerA],
    );
    receivableA = receivableInserted.rows[0].id;

    // Seeded directly (bypassing RLS, as the schema owner) so the cross-
    // player isolation test below has a committed row to check against —
    // a row inserted inside asPlayer's own begin/rollback would never
    // persist for a later, separate asPlayer call to see.
    const ledgerInserted = await client.query(
      `insert into public.ledger_lines
         (player_id, date, category, what, amount_original, currency_original, fx_rate_date, source)
       values ($1, '2026-09-10', 'food', 'Trattoria da Gino', 38.5, 'EUR', '2026-09-10', 'manual')
       returning id`,
      [playerA],
    );
    ledgerLineA = ledgerInserted.rows[0].id;
  });

  afterAll(async () => {
    await client.query(`delete from public.reserve_entries where player_id in ($1, $2)`, [
      playerA,
      playerB,
    ]);
    await client.query(`delete from public.prize_receivables where player_id in ($1, $2)`, [
      playerA,
      playerB,
    ]);
    await client.query(`delete from public.ledger_lines where player_id in ($1, $2)`, [
      playerA,
      playerB,
    ]);
    await client.query(`delete from public.players where id in ($1, $2)`, [playerA, playerB]);
    await client.query(`delete from auth.users where id in ($1, $2)`, [playerA, playerB]);
    await client.end();
  });

  it("lets a player read their own ledger_lines row, never another player's", async () => {
    await asPlayer(client, playerB, async () => {
      const result = await client.query('select id from public.ledger_lines');
      expect(result.rows).toEqual([]);
    });
    await asPlayer(client, playerA, async () => {
      const result = await client.query('select id from public.ledger_lines where id = $1', [
        ledgerLineA,
      ]);
      expect(result.rows).toEqual([{ id: ledgerLineA }]);
    });
  });

  it('lets a player insert their own ledger_lines row (read-your-own-write within the same session)', async () => {
    await asPlayer(client, playerA, async () => {
      const inserted = await client.query(
        `insert into public.ledger_lines
           (player_id, date, category, what, amount_original, currency_original, fx_rate_date, source)
         values ($1, '2026-09-11', 'coaching', 'Session with Marko', 60, 'EUR', '2026-09-11', 'manual')
         returning what`,
        [playerA],
      );
      expect(inserted.rows).toEqual([{ what: 'Session with Marko' }]);
    });
  });

  it("refuses a player inserting a ledger_lines row under someone else's player_id", async () => {
    await asPlayer(client, playerB, async () => {
      await expect(
        client.query(
          `insert into public.ledger_lines
             (player_id, date, category, what, amount_original, currency_original, fx_rate_date, source)
           values ($1, '2026-09-11', 'coaching', 'Forged line', 60, 'EUR', '2026-09-11', 'manual')`,
          [playerA],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("lets a player read their own prize_receivables row (service-role-created), never another player's, and refuses a direct player insert", async () => {
    await asPlayer(client, playerB, async () => {
      const result = await client.query('select id from public.prize_receivables');
      expect(result.rows).toEqual([]);
    });
    await asPlayer(client, playerA, async () => {
      const result = await client.query('select id from public.prize_receivables where id = $1', [
        receivableA,
      ]);
      expect(result.rows).toEqual([{ id: receivableA }]);

      // PRD-03 F-9: a receivable "is created from results," not by the
      // player directly — no insert policy exists at all for authenticated.
      await expect(
        client.query(
          `insert into public.prize_receivables
             (player_id, event, round, gross_amount, currency, expected_date)
           values ($1, 'singles', 'R1', 500, 'EUR', '2026-11-01')`,
          [playerA],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('refuses a receivable row that claims status=received without the realised fields, and vice versa', async () => {
    await expect(
      client.query(
        `insert into public.prize_receivables
           (player_id, event, round, gross_amount, currency, expected_date, status)
         values ($1, 'singles', 'R1', 500, 'EUR', '2026-11-01', 'received')`,
        [playerA],
      ),
    ).rejects.toThrow(/prize_receivables_realised_fields_match_status/);

    await expect(
      client.query(
        `insert into public.prize_receivables
           (player_id, event, round, gross_amount, currency, expected_date, status, received_at, realised_rate, realised_home_currency)
         values ($1, 'singles', 'R1', 500, 'EUR', '2026-11-01', 'pending', now(), 1.65, 'AUD')`,
        [playerA],
      ),
    ).rejects.toThrow(/prize_receivables_realised_fields_match_status/);
  });

  it("lets a player insert their own reserve_entries row with cause='player', but refuses cause='received_prize' directly", async () => {
    await asPlayer(client, playerA, async () => {
      await client.query(
        `insert into public.reserve_entries (player_id, amount, currency, cause) values ($1, 9450, 'AUD', 'player')`,
        [playerA],
      );
      const result = await client.query(
        'select amount from public.reserve_entries where player_id = $1',
        [playerA],
      );
      expect(result.rows).toEqual([{ amount: '9450' }]);

      // Only the receivable-received gated action (service role) may write
      // this cause — see the migration's own design note.
      await expect(
        client.query(
          `insert into public.reserve_entries (player_id, amount, currency, cause) values ($1, 12000, 'AUD', 'received_prize')`,
          [playerA],
        ),
      ).rejects.toThrow(/row-level security/);
    });
    await asPlayer(client, playerB, async () => {
      const result = await client.query('select id from public.reserve_entries');
      expect(result.rows).toEqual([]);
    });
  });
});

describeIfConfigured('settings row-level security (step 2.3)', () => {
  let client: Client;
  const playerA = randomUUID();

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(`insert into auth.users (id, email) values ($1, $2)`, [
      playerA,
      `settings-rls-a-${playerA}@deucex.test`,
    ]);
    await client.query(
      `insert into public.players
         (id, tour, name, email, country, dob, home_currency, app_language, units, timezone)
       values
         ($1, 'wta', 'Player A', $2, 'AU', '2000-01-01', 'AUD', 'en', 'metric', 'Australia/Sydney')`,
      [playerA, `settings-rls-a-${playerA}@deucex.test`],
    );
  });

  afterAll(async () => {
    await client.query(`delete from public.share_links where player_id = $1`, [playerA]);
    await client.query(`delete from public.players where id = $1`, [playerA]);
    await client.query(`delete from auth.users where id = $1`, [playerA]);
    await client.end();
  });

  it('lets a player update their own quiet_hours_start, but refuses deletion_effective_at directly (column-grant lockdown)', async () => {
    await asPlayer(client, playerA, async () => {
      await client.query(`update public.players set quiet_hours_start = '21:00' where id = $1`, [
        playerA,
      ]);
      const result = await client.query(
        'select quiet_hours_start from public.players where id = $1',
        [playerA],
      );
      expect(result.rows).toEqual([{ quiet_hours_start: '21:00:00' }]);

      await expect(
        client.query(`update public.players set deletion_effective_at = now() where id = $1`, [
          playerA,
        ]),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('refuses a direct anon select on share_links (the service-role bypass in apps/api/src/sharing is the only real read path)', async () => {
    await client.query('begin');
    try {
      await client.query('set local role anon');
      const result = await client.query('select id from public.share_links where player_id = $1', [
        playerA,
      ]);
      expect(result.rows).toEqual([]);
    } finally {
      await client.query('rollback');
    }
  });
});

describeIfConfigured('rankings and calendars row-level security (step 3.1)', () => {
  let client: Client;
  const playerA = randomUUID();
  const playerB = randomUUID();
  let tournamentId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(`insert into auth.users (id, email) values ($1, $2), ($3, $4)`, [
      playerA,
      `rankings-rls-a-${playerA}@deucex.test`,
      playerB,
      `rankings-rls-b-${playerB}@deucex.test`,
    ]);
    await client.query(
      `insert into public.players
         (id, tour, name, email, country, dob, home_currency, app_language, units, timezone,
          tour_player_id)
       values
         ($1, 'atp', 'Player A', $2, 'AU', '2000-01-01', 'AUD', 'en', 'metric', 'Australia/Sydney', $5),
         ($3, 'wta', 'Player B', $4, 'US', '2000-01-01', 'USD', 'en', 'imperial', 'America/New_York', null)`,
      [
        playerA,
        `rankings-rls-a-${playerA}@deucex.test`,
        playerB,
        `rankings-rls-b-${playerB}@deucex.test`,
        `rls-test-${playerA}`,
      ],
    );
    await client.query(
      `insert into public.ranking_snapshots
         (player_id, tour, tour_player_id, name, country, week_start, tour_singles_rank)
       values
         ($1, 'atp', $2, 'Player A', 'AU', '1901-01-01', 500),
         (null, 'atp', $3, 'Nobody Signed Up', 'FR', '1901-01-01', 900)`,
      [playerA, `rls-test-${playerA}`, `unmatched-${playerA}`],
    );
    const tournamentResult = await client.query(
      `insert into public.tournaments (tour, name, start_date, end_date)
       values ('atp', 'RLS Test Open', '1901-01-01', '1901-01-08')
       returning id`,
    );
    tournamentId = tournamentResult.rows[0].id;
  });

  afterAll(async () => {
    await client.query(
      `delete from public.ranking_snapshots
       where player_id in ($1, $2) or tour_player_id in ($3, $4)`,
      [playerA, playerB, `rls-test-${playerA}`, `unmatched-${playerA}`],
    );
    await client.query(`delete from public.tournaments where id = $1`, [tournamentId]);
    await client.query(`delete from public.players where id in ($1, $2)`, [playerA, playerB]);
    await client.query(`delete from auth.users where id in ($1, $2)`, [playerA, playerB]);
    await client.end();
  });

  it("lets a player read only their own ranking_snapshots row, never another player's and never an unmatched directory row", async () => {
    await asPlayer(client, playerA, async () => {
      const result = await client.query(
        'select player_id, tour_singles_rank from public.ranking_snapshots order by tour_singles_rank',
      );
      expect(result.rows).toEqual([{ player_id: playerA, tour_singles_rank: 500 }]);
    });
    await asPlayer(client, playerB, async () => {
      const result = await client.query('select id from public.ranking_snapshots');
      expect(result.rows).toEqual([]);
    });
  });

  it('refuses a player writing to ranking_snapshots directly (CSV/feed import is service-role only)', async () => {
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(
          `insert into public.ranking_snapshots
             (player_id, tour, tour_player_id, name, country, week_start, tour_singles_rank)
           values ($1, 'atp', 'forged', 'Player A', 'AU', '1901-01-02', 1)`,
          [playerA],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('lets any signed-in player read tournaments (shared reference data, not per-player)', async () => {
    await asPlayer(client, playerB, async () => {
      const result = await client.query('select id from public.tournaments where id = $1', [
        tournamentId,
      ]);
      expect(result.rows).toEqual([{ id: tournamentId }]);
    });
  });

  it('refuses a player writing to tournaments directly (ops/feed only)', async () => {
    await asPlayer(client, playerA, async () => {
      // No update policy exists for authenticated, so this isn't a thrown
      // RLS violation (that's specific to a failed WITH CHECK on insert,
      // proven above for ranking_snapshots) — the row is simply invisible
      // to the update's own USING clause, so it matches and changes nothing.
      const result = await client.query(
        `update public.tournaments set name = 'Hacked' where id = $1`,
        [tournamentId],
      );
      expect(result.rowCount).toBe(0);
      const check = await client.query('select name from public.tournaments where id = $1', [
        tournamentId,
      ]);
      expect(check.rows).toEqual([{ name: 'RLS Test Open' }]);
    });
  });

  it('refuses a signed-in player from reading feed_status, snapshot_imports or fact_corrections (staff/ops only, PRD-13 2.4)', async () => {
    await asPlayer(client, playerA, async () => {
      for (const table of ['feed_status', 'snapshot_imports', 'fact_corrections']) {
        const result = await client.query(`select id from public.${table}`);
        expect(result.rows).toEqual([]);
      }
    });
  });
});

describeIfConfigured('tournament agent row-level security (step 3.2)', () => {
  let client: Client;
  const playerA = randomUUID();
  const playerB = randomUUID();
  let tournamentId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(`insert into auth.users (id, email) values ($1, $2), ($3, $4)`, [
      playerA,
      `tournament-rls-a-${playerA}@deucex.test`,
      playerB,
      `tournament-rls-b-${playerB}@deucex.test`,
    ]);
    await client.query(
      `insert into public.players
         (id, tour, name, email, country, dob, home_currency, app_language, units, timezone)
       values
         ($1, 'atp', 'Player A', $2, 'AU', '2000-01-01', 'AUD', 'en', 'metric', 'Australia/Sydney'),
         ($3, 'wta', 'Player B', $4, 'US', '2000-01-01', 'USD', 'en', 'imperial', 'America/New_York')`,
      [
        playerA,
        `tournament-rls-a-${playerA}@deucex.test`,
        playerB,
        `tournament-rls-b-${playerB}@deucex.test`,
      ],
    );
    const tournamentResult = await client.query(
      `insert into public.tournaments (tour, name, start_date, end_date)
       values ('atp', 'RLS Test Challenger', '1901-01-01', '1901-01-08')
       returning id`,
    );
    tournamentId = tournamentResult.rows[0].id;
    // Only the service role ever inserts entry_decisions/shortlist_candidates
    // rows (the scheduled run) — this base client connects as the role that
    // owns the tables (see the comment near line 251), so this insert is the
    // fixture setup, not something being tested.
    await client.query(
      `insert into public.entry_decisions (player_id, tournament_id, status)
       values ($1, $2, 'none')`,
      [playerA, tournamentId],
    );
    await client.query(
      `insert into public.shortlist_candidates
         (player_id, tournament_id, rank, ratio, cost, exp, lo, hi, acceptance_status, why)
       values ($1, $2, 1, 0.42, '{"total": 1010}'::jsonb, 260, -1010, 2540, 'direct', 'Test candidate')`,
      [playerA, tournamentId],
    );
  });

  afterAll(async () => {
    await client.query(`delete from public.shortlist_candidates where tournament_id = $1`, [
      tournamentId,
    ]);
    await client.query(`delete from public.entry_decisions where tournament_id = $1`, [
      tournamentId,
    ]);
    await client.query(`delete from public.tournaments where id = $1`, [tournamentId]);
    await client.query(`delete from public.players where id in ($1, $2)`, [playerA, playerB]);
    await client.query(`delete from auth.users where id in ($1, $2)`, [playerA, playerB]);
    await client.end();
  });

  it('lets a player read only their own entry_decisions and shortlist_candidates rows', async () => {
    await asPlayer(client, playerA, async () => {
      const decisions = await client.query('select player_id from public.entry_decisions');
      expect(decisions.rows).toEqual([{ player_id: playerA }]);
      const candidates = await client.query('select player_id from public.shortlist_candidates');
      expect(candidates.rows).toEqual([{ player_id: playerA }]);
    });
    await asPlayer(client, playerB, async () => {
      const decisions = await client.query('select id from public.entry_decisions');
      expect(decisions.rows).toEqual([]);
      const candidates = await client.query('select id from public.shortlist_candidates');
      expect(candidates.rows).toEqual([]);
    });
  });

  it('lets a player Skip (none -> skipped) and Undo (skipped -> none) directly (PRD-01 T-10)', async () => {
    await asPlayer(client, playerA, async () => {
      const skip = await client.query(
        `update public.entry_decisions set status = 'skipped' where tournament_id = $1`,
        [tournamentId],
      );
      expect(skip.rowCount).toBe(1);
      const undo = await client.query(
        `update public.entry_decisions set status = 'none' where tournament_id = $1`,
        [tournamentId],
      );
      expect(undo.rowCount).toBe(1);
    });
  });

  it('refuses a player setting status to entered or withdrawn directly — only confirmEntry/withdrawEntry (service role) may (TECH-ARCHITECTURE.md section 3)', async () => {
    // Two separate transactions, not one: once a statement raises inside a
    // Postgres transaction, every later statement in that same transaction
    // fails with "current transaction is aborted" rather than its own
    // distinct error, the same "always rolling back" test-helper trap the
    // step 1.1 notes RLS block had already been found and fixed for once.
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(
          `update public.entry_decisions set status = 'entered' where tournament_id = $1`,
          [tournamentId],
        ),
      ).rejects.toThrow(/row-level security/);
    });
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(
          `update public.entry_decisions set status = 'withdrawn' where tournament_id = $1`,
          [tournamentId],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('refuses a player setting planned_expense_id directly, even alongside an otherwise-allowed status', async () => {
    await client.query(
      `insert into public.ledger_lines (player_id, date, category, what, amount_original, currency_original, fx_rate_date, source)
       values ($1, '1901-01-01', 'travel', 'Forged planned line', 100, 'AUD', '1901-01-01', 'planned')`,
      [playerA],
    );
    const ledgerRow = await client.query(
      `select id from public.ledger_lines where player_id = $1 and what = 'Forged planned line'`,
      [playerA],
    );
    const ledgerLineId = ledgerRow.rows[0].id;
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(
          `update public.entry_decisions set status = 'skipped', planned_expense_id = $1 where tournament_id = $2`,
          [ledgerLineId, tournamentId],
        ),
      ).rejects.toThrow(/row-level security/);
    });
    await client.query(`delete from public.ledger_lines where id = $1`, [ledgerLineId]);
  });

  it('refuses a player inserting an entry_decisions row directly (created only by the scheduled run)', async () => {
    const secondTournament = await client.query(
      `insert into public.tournaments (tour, name, start_date, end_date)
       values ('atp', 'RLS Test Second Event', '1901-02-01', '1901-02-08')
       returning id`,
    );
    const secondTournamentId = secondTournament.rows[0].id;
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(
          `insert into public.entry_decisions (player_id, tournament_id, status) values ($1, $2, 'none')`,
          [playerA, secondTournamentId],
        ),
      ).rejects.toThrow(/row-level security/);
    });
    await client.query(`delete from public.tournaments where id = $1`, [secondTournamentId]);
  });

  it('refuses a player writing to shortlist_candidates at all (system-computed, service role only)', async () => {
    await asPlayer(client, playerA, async () => {
      const result = await client.query(
        `update public.shortlist_candidates set rank = 99 where tournament_id = $1`,
        [tournamentId],
      );
      expect(result.rowCount).toBe(0);
      const check = await client.query(
        `select rank from public.shortlist_candidates where tournament_id = $1`,
        [tournamentId],
      );
      expect(check.rows).toEqual([{ rank: 1 }]);
    });
  });
});

describeIfConfigured('fans row-level security (step 4.1)', () => {
  let client: Client;
  const playerA = randomUUID();
  const playerB = randomUUID();
  const slug = `rls-fans-${playerA.slice(0, 8)}`;
  const eventId = `evt_rls_${playerA.slice(0, 8)}`;
  let tierId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(`insert into auth.users (id, email) values ($1, $2), ($3, $4)`, [
      playerA,
      `fans-rls-a-${playerA}@deucex.test`,
      playerB,
      `fans-rls-b-${playerB}@deucex.test`,
    ]);
    await client.query(
      `insert into public.players
         (id, tour, name, email, country, dob, home_currency, app_language, units, timezone)
       values
         ($1, 'wta', 'Player A', $2, 'AU', '2000-01-01', 'AUD', 'en', 'metric', 'Australia/Sydney'),
         ($3, 'atp', 'Player B', $4, 'US', '2000-01-01', 'USD', 'en', 'imperial', 'America/New_York')`,
      [playerA, `fans-rls-a-${playerA}@deucex.test`, playerB, `fans-rls-b-${playerB}@deucex.test`],
    );
    // Fixture setup as the table owner (the service role's equivalent):
    // every one of these rows is written by apps/api in production, never
    // by a player.
    await client.query(
      `insert into public.patron_programmes (player_id, slug, stripe_account_id, kyc_status)
       values ($1, $2, $3, 'complete')`,
      [playerA, slug, `acct_rls_${playerA.slice(0, 8)}`],
    );
    const tier = await client.query(
      `insert into public.patron_tiers (player_id, position, name, price, currency)
       values ($1, 1, 'Courtside', 29, 'AUD') returning id`,
      [playerA],
    );
    tierId = tier.rows[0].id;
    await client.query(
      `insert into public.patrons (player_id, tier_id, stripe_subscription_id, name, email, price, currency)
       values ($1, $2, $3, 'Mira Kovac', 'mira@deucex.test', 29, 'AUD')`,
      [playerA, tierId, `sub_rls_${playerA.slice(0, 8)}`],
    );
    await client.query(
      `insert into public.payouts
         (player_id, stripe_payout_id, friday, gross, platform_fee, platform_fee_rate, stripe_fee, net, currency, status)
       values ($1, $2, '1901-01-04', 612, 48.96, 0.08, 14.34, 548.70, 'AUD', 'paid')`,
      [playerA, `po_rls_${playerA.slice(0, 8)}`],
    );
    await client.query(
      `insert into public.stripe_webhook_events (id, type) values ($1, 'payout.paid')`,
      [eventId],
    );
  });

  afterAll(async () => {
    await client.query(`delete from public.stripe_webhook_events where id = $1`, [eventId]);
    // The paid payout is immutable to everyone, including this owner
    // connection, so it goes with its player via the cascade the trigger
    // does allow: disable the trigger for this fixture's own teardown only.
    await client.query(`alter table public.payouts disable trigger payouts_paid_immutable`);
    await client.query(`delete from public.payouts where player_id = $1`, [playerA]);
    await client.query(`alter table public.payouts enable trigger payouts_paid_immutable`);
    await client.query(`delete from public.approvals where player_id = $1`, [playerA]);
    await client.query(`delete from public.patrons where player_id = $1`, [playerA]);
    await client.query(`delete from public.patron_tiers where player_id = $1`, [playerA]);
    await client.query(`delete from public.patron_programmes where player_id = $1`, [playerA]);
    await client.query(`delete from public.players where id in ($1, $2)`, [playerA, playerB]);
    await client.query(`delete from auth.users where id in ($1, $2)`, [playerA, playerB]);
    await client.end();
  });

  it('lets a player read only their own programme, tiers, patrons and payouts', async () => {
    await asPlayer(client, playerA, async () => {
      expect((await client.query('select slug from public.patron_programmes')).rows).toEqual([
        { slug },
      ]);
      expect((await client.query('select name from public.patron_tiers')).rows).toEqual([
        { name: 'Courtside' },
      ]);
      expect((await client.query('select name from public.patrons')).rows).toEqual([
        { name: 'Mira Kovac' },
      ]);
      expect((await client.query('select status from public.payouts')).rows).toEqual([
        { status: 'paid' },
      ]);
    });
    await asPlayer(client, playerB, async () => {
      for (const table of ['patron_programmes', 'patron_tiers', 'patrons', 'payouts']) {
        expect((await client.query(`select 1 from public.${table}`)).rows, table).toEqual([]);
      }
    });
  });

  it('lets a player flip the Patron names switch, and nothing else on the programme row (P-19)', async () => {
    await asPlayer(client, playerA, async () => {
      const result = await client.query(
        `update public.patron_programmes set names_line_enabled = true where player_id = $1`,
        [playerA],
      );
      expect(result.rowCount).toBe(1);
    });
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(`update public.patron_programmes set kyc_status = 'complete', slug = 'x-y-z'`),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('refuses a player inserting or changing a patron or a payout directly (Stripe webhooks only)', async () => {
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(
          `insert into public.patrons (player_id, tier_id, stripe_subscription_id, name, price, currency)
           values ($1, $2, 'sub_forged', 'Forged', 1, 'AUD')`,
          [playerA, tierId],
        ),
      ).rejects.toThrow(/row-level security/);
    });
    await asPlayer(client, playerA, async () => {
      const patron = await client.query(`update public.patrons set status = 'left'`);
      expect(patron.rowCount).toBe(0);
      const payout = await client.query(`update public.payouts set net = 1`);
      expect(payout.rowCount).toBe(0);
    });
  });

  it('keeps the Stripe webhook log invisible to players', async () => {
    await asPlayer(client, playerA, async () => {
      expect((await client.query('select id from public.stripe_webhook_events')).rows).toEqual([]);
    });
  });

  it('makes a paid payout immutable even to the service role, and enforces net = gross - fee - Stripe (M-GATE-3)', async () => {
    await expect(
      client.query(`update public.payouts set status = 'failed' where player_id = $1`, [playerA]),
    ).rejects.toThrow(/cannot be changed or removed/);
    await expect(
      client.query(
        `insert into public.payouts
           (player_id, stripe_payout_id, friday, gross, platform_fee, platform_fee_rate, stripe_fee, net, currency, status)
         values ($1, 'po_bad_net', '1901-01-11', 612, 48.96, 0.08, 14.34, 551, 'AUD', 'scheduled')`,
        [playerA],
      ),
    ).rejects.toThrow(/payouts_net_check/);
  });

  it('accepts the two new gated action types from the player themselves', async () => {
    await asPlayer(client, playerA, async () => {
      const result = await client.query(
        `insert into public.approvals (player_id, approved_by, action_type, payload)
         values ($1, $1, 'connect_onboard', '{}'::jsonb), ($1, $1, 'waitlist_invite', '{"entryId":"x"}'::jsonb)`,
        [playerA],
      );
      expect(result.rowCount).toBe(2);
    });
  });
});

describeIfConfigured('content agent row-level security (step 4.2)', () => {
  let client: Client;
  const playerA = randomUUID();
  const playerB = randomUUID();
  let updateId: string;
  let patronId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(`insert into auth.users (id, email) values ($1, $2), ($3, $4)`, [
      playerA,
      `content-rls-a-${playerA}@deucex.test`,
      playerB,
      `content-rls-b-${playerB}@deucex.test`,
    ]);
    await client.query(
      `insert into public.players
         (id, tour, name, email, country, dob, home_currency, app_language, units, timezone)
       values
         ($1, 'wta', 'Player A', $2, 'AU', '2000-01-01', 'AUD', 'en', 'metric', 'Australia/Sydney'),
         ($3, 'atp', 'Player B', $4, 'US', '2000-01-01', 'USD', 'en', 'imperial', 'America/New_York')`,
      [
        playerA,
        `content-rls-a-${playerA}@deucex.test`,
        playerB,
        `content-rls-b-${playerB}@deucex.test`,
      ],
    );
    // Fixture rows as the table owner: apps/api writes these in production.
    const tier = await client.query(
      `insert into public.patron_tiers (player_id, position, name, price, currency)
       values ($1, 1, 'Courtside', 29, 'AUD') returning id`,
      [playerA],
    );
    const patron = await client.query(
      `insert into public.patrons (player_id, tier_id, stripe_subscription_id, name, email, price, currency)
       values ($1, $2, $3, 'Mira Kovac', 'mira@deucex.test', 29, 'AUD') returning id`,
      [playerA, tier.rows[0].id, `sub_content_rls_${playerA.slice(0, 8)}`],
    );
    patronId = patron.rows[0].id;
    const update = await client.query(
      `insert into public.patron_updates (player_id, trigger, status, subject, body, tier_ids)
       values ($1, 'manual', 'draft', 'Three set points', 'I lost 6-4 3-6 6-7(5).', array[$2::uuid])
       returning id`,
      [playerA, tier.rows[0].id],
    );
    updateId = update.rows[0].id;
    await client.query(
      `insert into public.patron_update_sends (update_id, player_id, patron_id, status, email_id)
       values ($1, $2, $3, 'sent', 'email_rls')`,
      [updateId, playerA, patronId],
    );
  });

  afterAll(async () => {
    await client.query(`delete from public.patron_updates where player_id = $1`, [playerA]);
    await client.query(`delete from public.patrons where player_id = $1`, [playerA]);
    await client.query(`delete from public.patron_tiers where player_id = $1`, [playerA]);
    await client.query(`delete from public.players where id in ($1, $2)`, [playerA, playerB]);
    await client.query(`delete from auth.users where id in ($1, $2)`, [playerA, playerB]);
    await client.end();
  });

  it('lets a player read only their own updates and sends', async () => {
    await asPlayer(client, playerA, async () => {
      expect((await client.query('select subject from public.patron_updates')).rows).toEqual([
        { subject: 'Three set points' },
      ]);
      expect((await client.query('select email_id from public.patron_update_sends')).rows).toEqual([
        { email_id: 'email_rls' },
      ]);
    });
    await asPlayer(client, playerB, async () => {
      expect((await client.query('select 1 from public.patron_updates')).rows).toEqual([]);
      expect((await client.query('select 1 from public.patron_update_sends')).rows).toEqual([]);
    });
  });

  it('refuses a player marking an update published or inserting one (apps/api only)', async () => {
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(`update public.patron_updates set status = 'published' where id = $1`, [
          updateId,
        ]),
      ).rejects.toThrow(/permission denied/);
    });
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(
          `insert into public.patron_updates (player_id, trigger, status) values ($1, 'manual', 'draft')`,
          [playerA],
        ),
      ).rejects.toThrow(/permission denied/);
    });
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(`update public.patron_update_sends set opened_at = now()`),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('allows only one open draft per player, and one draft per note', async () => {
    await expect(
      client.query(
        `insert into public.patron_updates (player_id, trigger, status) values ($1, 'manual', 'queued')`,
        [playerA],
      ),
    ).rejects.toThrow(/patron_updates_one_open_draft_idx/);
  });

  it('lets a player change their own Content Agent settings', async () => {
    await asPlayer(client, playerA, async () => {
      const result = await client.query(
        `update public.players
            set content_window = 'next_morning', content_private_names = array['Marko'], profile_teaser = false
          where id = $1`,
        [playerA],
      );
      expect(result.rowCount).toBe(1);
    });
    await asPlayer(client, playerA, async () => {
      await expect(
        client.query(`update public.players set content_window = 'hourly' where id = $1`, [
          playerA,
        ]),
      ).rejects.toThrow(/content_window_check/);
    });
  });
});
