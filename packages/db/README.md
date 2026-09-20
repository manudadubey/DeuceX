# @procircuit/db

Supabase project: **ProCircuit** (`gpzpmrumwaqyfkyvqbgl`, org `MD Labs`, region `ap-northeast-1`).

This project already holds an unrelated schema (`matches`, `points`, `stats_overview`,
`stats_rally`, `stats_serve_basics`) from a different app. ProCircuit's own tables live
alongside them in the same database; row-level security is enabled on the existing tables
so they stay isolated from anything added here.

Migrations for ProCircuit's own schema (players, fx_rates_daily, agent_runs, approvals,
admin_actions, notifications, share_links, and so on) start in step 0.2 of
`docs/BUILD-PLAN-CLAUDE-CODE.md`. Nothing has been applied yet beyond the RLS fix on the
pre-existing tables.

Env vars needed (see `.env.example` at the repo root): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`.
