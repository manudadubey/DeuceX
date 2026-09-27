-- Step 5.4: hardening and the cost pass (TECH-ARCHITECTURE.md sections 5 to 8).
--
-- Design notes (see docs/BUILD-LOG.md's step 5.4 entry for the full write-up):
-- * erasure_records is the GDPR erasure job's completion record
--   (TECH-ARCHITECTURE.md section 7: "an explicit, tracked deletion job with a
--   completion record, not assumed from a deleted Postgres row"). One row per
--   erased player, written before anything is deleted and completed after, so
--   a sweep that dies halfway leaves a visible 'running' row rather than
--   nothing. player_id deliberately has no foreign key: the whole point of the
--   row is to outlive the player. It holds no personal content, only which
--   processor was reached and what happened (steps jsonb), so the console may
--   read it (Trust and safety's data requests). Service role writes; players
--   have no policy at all (their account no longer exists when it matters).
-- * on_demand_requests counts the on-demand paths that spend a model call
--   (per-tier rate limits, TECH-ARCHITECTURE.md section 5's fourth fix). A
--   request row is written only when a request passes the limit, and the
--   limit counts rows in the last rolling 24 hours. Counted here rather than
--   inferred from agent_runs, which can't tell an extraction retry from a
--   first extraction and doesn't see cache hits. Service role only.
-- * conditions_briefs.prose_inputs_hash lets the weekly Conditions run skip
--   the prose call for a brief whose rules and comparison event haven't
--   changed since the last run (TECH-ARCHITECTURE.md section 5's caching fix,
--   the one generated-prose path that wasn't cached yet).
-- * grafana_reader is a no-login role that can read agent_health_daily and
--   nothing else, for the Grafana dashboard in ops/grafana (PRD-13 links out
--   to Grafana rather than rebuilding it). The owner creates the actual
--   login user in it when the Grafana data source is set up (ops/README.md);
--   no password is created here.
-- * Two pre-existing blockers on the account-deletion cascade, found while
--   building the erasure job:
--   - admin_actions.player_id referenced players with no ON DELETE action, so
--     deleting any player a staff member had ever acted on failed. It now
--     sets null: the staff audit row survives, de-identified, and the
--     erasure record keeps the player id.
--   - payouts_paid_immutable refused to delete a paid payout even when the
--     delete was the cascade from erasing the player. It now lets a delete
--     through only when the player row is already gone (the cascade case);
--     a direct delete or update of a paid payout is still refused. Stripe
--     keeps its own payout records on the player's connected account.

-- ---------------------------------------------------------------------------
-- erasure_records
-- ---------------------------------------------------------------------------
create table public.erasure_records (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  deletion_requested_at timestamptz,
  deletion_effective_at timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'partial')),
  steps jsonb not null default '[]'::jsonb
);

comment on table public.erasure_records is
  'GDPR erasure completion record (TECH-ARCHITECTURE.md section 7). One row per erased player; no FK to players by design. steps: [{processor, outcome, detail, at}].';

create unique index erasure_records_player_idx on public.erasure_records (player_id);

alter table public.erasure_records enable row level security;
revoke all on public.erasure_records from anon, authenticated;

grant select on public.erasure_records to console;
create policy erasure_records_console_read on public.erasure_records
  for select to console using (true);

-- ---------------------------------------------------------------------------
-- on_demand_requests
-- ---------------------------------------------------------------------------
create table public.on_demand_requests (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null,
  requested_at timestamptz not null default now()
);

comment on table public.on_demand_requests is
  'On-demand model-spending requests that passed their rate limit (step 5.4). Counted over a rolling 24 hours per player and kind.';

create index on_demand_requests_player_kind_idx
  on public.on_demand_requests (player_id, kind, requested_at);

alter table public.on_demand_requests enable row level security;
revoke all on public.on_demand_requests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- conditions_briefs.prose_inputs_hash
-- ---------------------------------------------------------------------------
alter table public.conditions_briefs add column prose_inputs_hash text;

-- ---------------------------------------------------------------------------
-- grafana_reader
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'grafana_reader') then
    create role grafana_reader nologin;
  end if;
end
$$;

comment on role grafana_reader is
  'Read-only role for the Grafana agent-health dashboard (step 5.4). Grants: agent_health_daily only.';

grant usage on schema public to grafana_reader;
grant select on public.agent_health_daily to grafana_reader;
create policy agent_health_daily_grafana_read on public.agent_health_daily
  for select to grafana_reader using (true);

-- ---------------------------------------------------------------------------
-- The deletion cascade's two blockers
-- ---------------------------------------------------------------------------
alter table public.admin_actions drop constraint admin_actions_player_id_fkey;
alter table public.admin_actions
  add constraint admin_actions_player_id_fkey
  foreign key (player_id) references public.players (id) on delete set null;

create or replace function public.reject_paid_payout_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'paid' then
    -- The cascade from erasing the player: the players row is already gone
    -- by the time the cascade reaches payouts. Anything else is refused.
    if tg_op = 'DELETE' and not exists (select 1 from public.players where id = old.player_id) then
      return old;
    end if;
    raise exception 'payouts: a paid payout (%) cannot be changed or removed', old.stripe_payout_id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
