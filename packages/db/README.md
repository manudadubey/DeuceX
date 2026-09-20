# @procircuit/db

Supabase project: **ProCircuit** (`gpzpmrumwaqyfkyvqbgl`, org `MD Labs`, region `ap-northeast-1`).

This project already holds an unrelated schema (`matches`, `points`, `stats_overview`,
`stats_rally`, `stats_serve_basics`) from a different app. ProCircuit's own tables live
alongside them in the same database; row-level security is enabled on the existing tables
so they stay isolated from anything added here.

## Schema

Step 0.2 added the first ProCircuit tables: `players`, `fx_rates_daily`, `agent_runs`,
`approvals`, `admin_actions`, `notifications`, `share_links`, plus an empty `pgboss` schema
(pg-boss creates its own tables in there once a worker exists) and a `console` database role
with no grants yet. Migrations live in `migrations/` and are applied with the Supabase MCP
server's `apply_migration`, since the Supabase CLI isn't installed in this environment.
`src/database.types.ts` is generated from the live schema the same way (the MCP server's
`generate_typescript_types`) and needs regenerating by hand after any schema change.

Row-level security is on for every table above, keyed on `auth.uid()` for the player-scoped
ones. `fx_rates_daily` is shared reference data (readable by any authenticated user) but
insert-only at the database level: a trigger rejects UPDATE and DELETE outright. `agent_runs`,
`approvals` and `admin_actions` are append-only audit tables: UPDATE and DELETE are revoked from
every role at the grant level, not just blocked by RLS, so even the service role can't rewrite
history. See `docs/BUILD-LOG.md` (step 0.2) for the reasoning behind each design choice,
including one documented spec contradiction (fx_rates_daily's uniqueness key) that had to be
resolved, and one open question flagged for step 0.6 (approvals has no "consumed" column despite
TECH-ARCHITECTURE.md section 3 referring to one).

`src/rls.integration.test.ts` proves the isolation and insert-only behaviour, but needs a direct
Postgres connection (`SUPABASE_DB_URL`) to switch database roles mid-session, so it's skipped
unless that env var is set locally.

Env vars needed (see `.env.example` at the repo root): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`, and optionally `SUPABASE_DB_URL` for the
RLS integration tests.
