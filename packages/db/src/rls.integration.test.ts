// Integration tests against the real ProCircuit Supabase project (step 0.2).
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
      `rls-test-a-${playerA}@procircuit.test`,
      playerB,
      `rls-test-b-${playerB}@procircuit.test`,
    ]);
    await client.query(
      `insert into public.players
         (id, tour, name, email, country, dob, home_currency, app_language, units, timezone)
       values
         ($1, 'wta', 'Player A', $2, 'AU', '2000-01-01', 'AUD', 'en', 'metric', 'Australia/Sydney'),
         ($3, 'atp', 'Player B', $4, 'US', '2000-01-01', 'USD', 'en', 'imperial', 'America/New_York')`,
      [
        playerA,
        `rls-test-a-${playerA}@procircuit.test`,
        playerB,
        `rls-test-b-${playerB}@procircuit.test`,
      ],
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
