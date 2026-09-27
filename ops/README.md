# Operations runbook

Step 5.4 (hardening and the cost pass). Each section says what the tool is, when to run it and what
"good" looks like. Nothing here needs a paid plan.

## Staging

`deucex-staging` (Supabase project `asbrrmrhxmlvmvlwitmr`, MD Labs organisation, ap-northeast-1,
free plan). Owner decision, 26 September 2026: a separate free project stands in for database
branches until the production project is upgraded at launch.

- **Fixture data only.** Never copy real player data into it, including restore-drill dumps.
- **Migrations go to staging first**, then production (production still needs the owner's
  confirmation). Check parity with `scripts/schema-fingerprint.sql`: run it on both projects and
  compare the hashes.
- **It pauses after about a week without activity.** Resume it in the Supabase dashboard.
- Local `.env`: `STAGING_SUPABASE_URL` and `STAGING_SUPABASE_SECRET_KEY` (for the scripts below);
  `STAGING_DB_URL` (session pooler) is optional and only speeds up applying migrations with `psql`.

## Restore drill

```bash
scripts/restore-drill.sh
```

Dumps production (`public`, `auth`, `pgboss`) into a throwaway local Postgres 17 on this Mac, then
compares every public table's row count, RLS switch and policy count with production, and checks
the `console` role still can't read `notes.transcript`. The dump and the local cluster are deleted
on exit, pass or fail; the report (counts only) lands in `ops/restore-drill-<time>.md`. Needs
Homebrew `postgresql@17` and `SUPABASE_DB_URL`.

The free plan has no managed backups, so **this dump is the only backup**. Run it monthly and
before any risky migration. When the project moves to Pro at launch, Supabase's daily backups and
point-in-time recovery replace it, and the drill becomes "restore a backup into a branch".

First run: 26 September 2026, PASS (`ops/restore-drill-2026-09-26.md`).

## Uptime

`.github/workflows/uptime.yml` checks `https://deucex.vercel.app/api/health` every ten minutes from
GitHub's servers, three tries per run. A failed run emails the repository owner through GitHub
Actions notifications, and the Actions tab's run history is the availability log (99.5 percent a
month is about 3.6 hours of budget). GitHub can start scheduled runs late under load, so outages
shorter than about fifteen minutes can go unseen.

When `apps/api` is deployed, set the repository variable `API_HEALTH_URL` (Settings > Secrets and
variables > Actions > Variables) to its `/health` URL and the workflow checks it too.

## Grafana

`ops/grafana/agent-health.json` is a dashboard over `agent_health_daily` (runs, success rate, p95
latency, spend, approval and dismiss rates with the 30 percent line). To use it:

1. Open a free Grafana Cloud account.
2. In the Supabase SQL editor, create a login user in the `grafana_reader` role (the role can read
   `agent_health_daily` and nothing else):
   `create user grafana_login with password '<a new password>' in role grafana_reader;`
3. In Grafana, add a PostgreSQL data source with the session pooler host, user
   `grafana_login.gpzpmrumwaqyfkyvqbgl`, SSL required.
4. Import the JSON and choose that data source.

The admin console's Agent health page shows the same table day to day; Grafana is the longer view
PRD-13 links out to.

## Cost pass

```bash
pnpm --filter @deucex/api exec tsx scripts/cost-pass.ts <work-dir> [aud-per-usd]
```

One worst-case month of a busy Pro player's model calls against the real providers (no cache
hits), priced with `packages/actions`' pricing table. Costs about US$0.25 a run. Rerunning with
the same work directory resumes and only redoes calls the provider's rate limit refused. Rerun it
whenever a model tier or a prompt changes materially.

## Erasure drill

```bash
pnpm --filter @deucex/api exec tsx scripts/erasure-drill.ts
```

Runs the real account-deletion sweep against **staging only** (it refuses any other project) on a
fixture player carrying the rows that used to block the cascade, and prints the `erasure_records`
completion record. PASS means the record is `completed` and nothing of the player is left.
