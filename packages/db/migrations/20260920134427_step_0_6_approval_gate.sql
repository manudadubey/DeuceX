-- Step 0.6: the approval gate and audit, before any agent exists.
-- Source: TECH-ARCHITECTURE.md section 3, PRD-00 M-GATE-1 to M-GATE-4.
--
-- Design notes (see docs/BUILD-LOG.md for the full write-up):
-- * Step 0.2 flagged that TECH-ARCHITECTURE.md section 3 talks about verifying an
--   "unconsumed" approval, but approvals has no such column. Resolved here with a
--   separate append-only `approval_consumptions` table instead of a column on
--   `approvals`: `approvals` already has no UPDATE grant for any role (step 0.2,
--   deliberately, matching agent_runs and admin_actions), and a `consumed` column
--   would need exactly that grant to ever get flipped. A second table keeps that
--   invariant intact. Its primary key on `approval_id` is what makes "verify
--   unconsumed and consume" a single atomic INSERT (ON CONFLICT DO NOTHING)
--   instead of a check-then-act race between two concurrent callers.
-- * `agent_schedules` and `provider_switches` are both named in
--   TECH-ARCHITECTURE.md section 3 (".paused", ".prompt_overrides jsonb", and
--   2.4's own field list for provider_switches) but neither has a full type
--   spec written anywhere, because the admin kill switches (PRD-13 AD-15/16)
--   and Elite's Agent Studio that would manage them don't exist yet. Both
--   tables are defined here with exactly the fields TECH-ARCHITECTURE.md
--   already names, so the queue's pickup check has something real to read;
--   extending either later (e.g. an admin_users FK on provider_switches.changed_by
--   once the admin console exists) is an additive migration, not a rewrite.

-- ---------------------------------------------------------------------------
-- approval_consumptions: marks an approvals row consumed. See design note
-- above for why this is a separate table rather than a column.
-- ---------------------------------------------------------------------------
create table public.approval_consumptions (
  approval_id uuid primary key references public.approvals (id),
  player_id uuid not null references public.players (id) on delete cascade,
  agent_run_id uuid references public.agent_runs (id),
  payload_hash text not null,
  consumed_at timestamptz not null default now()
);

comment on table public.approval_consumptions is
  'Claims an approvals row (TECH-ARCHITECTURE.md section 3): packages/actions inserts here before performing the side effect it gates. A second insert for the same approval_id is rejected by the primary key, so "verify unconsumed, then consume" is one atomic statement, not a race. Kept separate from approvals so approvals stays append-only with no UPDATE grant for any role (step 0.2).';

create index approval_consumptions_player_idx on public.approval_consumptions (player_id, consumed_at);

alter table public.approval_consumptions enable row level security;

create policy approval_consumptions_select_own on public.approval_consumptions
  for select
  to authenticated
  using (player_id = auth.uid());

revoke update, delete on public.approval_consumptions from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agent_schedules: per-player, per-agent pause flag and Agent Studio prompt
-- overrides. Neither the admin kill switch nor Agent Studio exists yet; this
-- gives the queue's pickup check (step 0.6) something real to read. No row
-- for a given (player, agent) means "not paused, no overrides" (the default).
-- ---------------------------------------------------------------------------
create table public.agent_schedules (
  player_id uuid not null references public.players (id) on delete cascade,
  agent_name text not null,
  paused boolean not null default false,
  prompt_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, agent_name)
);

comment on table public.agent_schedules is
  'Per-player, per-agent pause flag and Elite Agent Studio prompt overrides (TECH-ARCHITECTURE.md section 3). A missing row means not paused, no overrides.';

alter table public.agent_schedules enable row level security;

create policy agent_schedules_select_own on public.agent_schedules
  for select
  to authenticated
  using (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- provider_switches: append-only history of platform-wide kill switches
-- (TECH-ARCHITECTURE.md 2.4, PRD-13 AD-15/16). Not player-scoped. No role
-- grants beyond the default service-role access: the admin console's own
-- read/write grants land with PRD-13's build step, same deferral step 0.2
-- made for the console role generally.
-- ---------------------------------------------------------------------------
create table public.provider_switches (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  state text not null check (state in ('on', 'off')),
  changed_by uuid,
  reason text,
  changed_at timestamptz not null default now()
);

comment on table public.provider_switches is
  'Append-only history of platform-wide provider kill switches (PRD-13 AD-15/16). changed_by has no FK yet: admin_users lands with the admin console (Phase 5). A provider with no row yet is implicitly "on". The queue''s pickup check (step 0.6) reads the latest row per provider via the service role, which bypasses RLS.';

create index provider_switches_provider_changed_idx on public.provider_switches (provider, changed_at desc);

alter table public.provider_switches enable row level security;

revoke update, delete on public.provider_switches from anon, authenticated, service_role;
