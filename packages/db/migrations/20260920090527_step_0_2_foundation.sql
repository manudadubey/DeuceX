-- Step 0.2: database foundation.
-- Scope: players, fx_rates_daily, agent_runs, approvals, admin_actions,
-- notifications, share_links, the pgboss schema, and the console role.
-- Source: TECH-ARCHITECTURE.md sections 2.1-2.3, PRD-00 section 5.3.
--
-- Design notes (see docs/BUILD-LOG.md for the full write-up):
-- * TECH-ARCHITECTURE.md 2.1 says fx_rates_daily is unique on (date, currency)
--   but also says a provisional rate and its later real rate are "both kept."
--   Those two sentences conflict (PRD-03 confirms both rows must survive:
--   "an unpublished ECB rate saves as provisional and is re-rated once, both
--   rates audited"). Resolved here by keying uniqueness on
--   (date, currency, source) instead, which satisfies "both kept" while still
--   rejecting an accidental duplicate fetch of the same source/day/currency.
-- * agent_runs, approvals and admin_actions sit under one "2.3 The audit log"
--   heading, so all three are treated as append-only: table-level UPDATE and
--   DELETE are revoked from every role, not just gated by RLS, matching the
--   explicit "no update or delete grant for any role" language written for
--   admin_actions.
-- * approvals.action_type and admin_actions.reason follow the exact lists
--   given in the docs; extending either list later is an additive migration
--   (drop + re-add the check constraint).
-- * notifications.read and share_links' renewal fields are the only columns a
--   player may update on those two tables; enforced with column-level GRANTs
--   alongside the row-level policy, so a player session cannot rewrite a
--   notification's own title/body or forge someone else's token metadata.
-- * players RLS covers whole-row select/update for now. Column-level limits
--   on sensitive fields (verification, tier, deletion_*) are deferred to the
--   settings/billing steps that actually own those transitions.
-- * approvals lacks a documented "consumed" flag even though TECH-ARCHITECTURE
--   section 3 talks about verifying an "unconsumed" approval. Section 2.3's
--   own field list has no such column, and this step is scoped to exactly
--   that field list, so it is left out here and flagged as a question for
--   step 0.6 (the approval gate).

-- ---------------------------------------------------------------------------
-- console role: exists, no grants yet (TECH-ARCHITECTURE.md 2.4 assigns its
-- grants later; it must never reach notes, audio, moods or fan_answers.text).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'console') then
    create role console nologin;
  end if;
end
$$;

comment on role console is
  'Admin console database role (TECH-ARCHITECTURE.md 2.4). No grants until the step that needs them; never grant notes.transcript, notes.audio_ref, notes.mood, Fuel/receipt photo refs, or fan_answers.text.';

-- ---------------------------------------------------------------------------
-- pg-boss schema: namespace only. pg-boss creates and migrates its own job
-- tables inside this schema the first time the worker calls boss.start(),
-- which happens in a later step once a worker process actually exists.
-- ---------------------------------------------------------------------------
create schema if not exists pgboss;

comment on schema pgboss is
  'Reserved for pg-boss''s own job-queue tables (TECH-ARCHITECTURE.md section 3). Populated by pg-boss at worker start, not by a hand-written migration.';

-- ---------------------------------------------------------------------------
-- players: root tenant for row-level isolation.
-- ---------------------------------------------------------------------------
create table public.players (
  id uuid primary key references auth.users (id) on delete cascade,
  tour text not null check (tour in ('atp', 'wta')),
  name text not null,
  email text not null unique,
  country text not null,
  dob date not null,
  guardian_email text,
  guardian_confirmed_at timestamptz,
  verification text not null default 'unverified'
    check (verification in ('verified', 'ambiguous', 'unverified')),
  verification_source text,
  home_currency text not null,
  patron_language char(2),
  app_language text not null,
  units text not null,
  timezone text not null,
  stage text,
  stage_pinned boolean not null default false,
  tier text,
  tier_status text,
  deletion_requested_at timestamptz,
  deletion_effective_at timestamptz,
  deletion_cancelled_at timestamptz
);

comment on table public.players is
  'Root tenant for row-level isolation (TECH-ARCHITECTURE.md 2.2). id matches the auth.users id created at sign-in.';

alter table public.players enable row level security;

create policy players_select_own on public.players
  for select
  to authenticated
  using (id = auth.uid());

create policy players_update_own on public.players
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- fx_rates_daily: append-only ECB reference archive. Shared reference data,
-- not player-scoped, but insert-only at the database level per step 0.2.
-- ---------------------------------------------------------------------------
create table public.fx_rates_daily (
  date date not null,
  currency char(3) not null,
  rate_to_eur numeric not null check (rate_to_eur > 0),
  source text not null check (source in ('ecb', 'provisional')),
  fetched_at timestamptz not null default now(),
  primary key (date, currency, source)
);

comment on table public.fx_rates_daily is
  'Insert-only ECB reference rate archive (M-DATA-1). Keyed on (date, currency, source) so a provisional rate and its later real rate can both be kept, per PRD-03''s "both rates audited."';

alter table public.fx_rates_daily enable row level security;

create policy fx_rates_daily_select_all on public.fx_rates_daily
  for select
  to authenticated, anon
  using (true);

create function public.reject_fx_rates_daily_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'fx_rates_daily is insert-only: % is not allowed', tg_op;
end;
$$;

create trigger fx_rates_daily_no_update
  before update on public.fx_rates_daily
  for each row execute function public.reject_fx_rates_daily_mutation();

create trigger fx_rates_daily_no_delete
  before delete on public.fx_rates_daily
  for each row execute function public.reject_fx_rates_daily_mutation();

-- ---------------------------------------------------------------------------
-- agent_runs / approvals: the audit log (TECH-ARCHITECTURE.md 2.3).
-- Both append-only: no role gets UPDATE or DELETE at the grant level.
-- ---------------------------------------------------------------------------
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  player_id uuid not null references public.players (id) on delete cascade,
  trigger_type text not null check (trigger_type in ('schedule', 'manual', 'event', 'threshold')),
  started_at timestamptz not null,
  completed_at timestamptz,
  inputs_hash text not null,
  model text not null,
  prompt_version text not null,
  schema_version text not null,
  status text not null check (status in ('succeeded', 'failed_validation', 'failed_infra', 'degraded')),
  output jsonb,
  cost_amount numeric,
  cost_currency char(3)
);

comment on table public.agent_runs is
  'Every agent run, one row per run (M-GATE-4). Append-only.';

create index agent_runs_player_started_idx on public.agent_runs (player_id, started_at);

alter table public.agent_runs enable row level security;

create policy agent_runs_select_own on public.agent_runs
  for select
  to authenticated
  using (player_id = auth.uid());

revoke update, delete on public.agent_runs from anon, authenticated, service_role;

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  agent_run_id uuid references public.agent_runs (id),
  action_type text not null check (
    action_type in (
      'entry_confirm', 'expense_save', 'balance_update', 'patron_send',
      'content_publish', 'sponsor_send', 'retract', 'tier_change'
    )
  ),
  payload jsonb not null,
  approved_by uuid not null references public.players (id),
  approved_at timestamptz not null default now(),
  device text
);

comment on table public.approvals is
  'Every player approval that authorised an external action (M-GATE-1, M-GATE-4). Append-only.';

create index approvals_player_approved_idx on public.approvals (player_id, approved_at);

alter table public.approvals enable row level security;

create policy approvals_select_own on public.approvals
  for select
  to authenticated
  using (player_id = auth.uid());

create policy approvals_insert_own on public.approvals
  for insert
  to authenticated
  with check (player_id = auth.uid() and approved_by = auth.uid());

revoke update, delete on public.approvals from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- admin_actions: the staff side of the audit log (PRD-13 AD-4, AD-5).
-- ---------------------------------------------------------------------------
create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  role_at_time text not null,
  player_id uuid references public.players (id),
  action_type text not null,
  target jsonb,
  consequence text not null,
  reason text,
  device text,
  created_at timestamptz not null default now(),
  notified_player boolean not null default false,
  constraint admin_actions_reason_required check (
    reason is not null
    or action_type not in ('delete_account', 'comp', 'refund', 'snapshot_apply', 'provider_switch')
  )
);

comment on table public.admin_actions is
  'Every staff action on a player account (PRD-13 AD-4, AD-5). Append-only. admin_id has no FK yet: admin_users lands with the admin console in a later phase.';

create index admin_actions_player_created_idx on public.admin_actions (player_id, created_at);
create index admin_actions_admin_created_idx on public.admin_actions (admin_id, created_at);

alter table public.admin_actions enable row level security;

create policy admin_actions_select_own on public.admin_actions
  for select
  to authenticated
  using (player_id = auth.uid());

revoke update, delete on public.admin_actions from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- notifications: player-scoped, player may only flip `read`.
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  agent text not null,
  category text not null check (category in ('for_you', 'fyi')),
  title text not null,
  body text not null,
  action_href text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'Player-facing notifications from agents.';

create index notifications_player_created_idx on public.notifications (player_id, created_at);

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select
  to authenticated
  using (player_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update
  to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

revoke update on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- share_links: player-scoped coach/manager links.
-- ---------------------------------------------------------------------------
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  scope text not null check (scope in ('coach', 'manager')),
  token char(32) not null,
  revoked boolean not null default false,
  last_opened_at timestamptz,
  open_count integer not null default 0,
  created_at timestamptz not null default now(),
  renewed_at timestamptz,
  expires_at timestamptz not null
);

comment on table public.share_links is
  'Coach/manager share links. expires_at is 90 days from created_at or the latest renewed_at, set by the app.';

create unique index share_links_token_idx on public.share_links (token);

alter table public.share_links enable row level security;

create policy share_links_select_own on public.share_links
  for select
  to authenticated
  using (player_id = auth.uid());

create policy share_links_insert_own on public.share_links
  for insert
  to authenticated
  with check (player_id = auth.uid());

create policy share_links_update_own on public.share_links
  for update
  to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

revoke update on public.share_links from authenticated;
grant update (revoked, renewed_at, expires_at) on public.share_links to authenticated;
