-- Step 5.1: the admin console (PRD-13, TECH-ARCHITECTURE.md 2.4).
--
-- Design notes (see docs/BUILD-LOG.md's step 5.1 entry for the full write-up):
-- * Staff identity: `admin_users`, keyed on auth.users like `players`, in the
--   same Supabase project. AD-1's "no player identity may hold a staff role"
--   is enforced in both directions by triggers: an admin row is refused for
--   an id or email that has a players row, and a players row is refused for
--   an id that holds an unrevoked staff role (so a staff identity can't
--   onboard itself as a player from apps/web either).
-- * The console reaches the database as the `console` role, which step 0.2
--   created with no grants. apps/api's staff routes open a transaction on
--   SUPABASE_DB_URL (the postgres user, already a member of console) and
--   `set local role console` before any query, so every console read and
--   write is bounded by the explicit column grants below rather than by
--   screen design (TECH-ARCHITECTURE.md 2.4, AD-6). console is not
--   BYPASSRLS, so each table it touches gets a permissive `to console`
--   policy; the grants are what actually limit it.
-- * Never granted to console (AD-6): notes.transcript, notes.audio_ref,
--   notes.mood and every other note content column, check_ins.value and
--   .sentence (the daily mood), agent_runs.output and approvals.payload
--   (both can carry draft or transcript-derived text), menu_scans and
--   meal_logs (Fuel photo references), patron names and emails, share-link
--   tokens, players.emergency_contact and the deletion token. There is no
--   fan_answers table yet (Release 2).
-- * admin_actions gains admin_name (a snapshot, so the player's own log can
--   show "name and role, never contact details" (PRD-13 section 10) from
--   the existing select-own policy without a join to admin_users) and ip.
--   The player's select is narrowed to named columns so device and ip stay
--   staff-only.
-- * admin_action_consumptions is the admin-action gate's claim table, the
--   staff twin of approval_consumptions: a staff-triggered email or other
--   side effect runs only after its admin_actions row is claimed once
--   (owner decision, 25 September 2026: "player approval or accountable
--   staff action").
-- * run_failures gives the queue's retry path a persistent record (AD-14):
--   before this, a failed attempt only lived in pg-boss's job table.
-- * agent_global_pauses is AD-15's global pause (per-player pause stays in
--   agent_schedules); latest row per agent wins, like provider_switches.
-- * agent_health_daily is the nightly aggregation's output (AD-13), one row
--   per agent per day; approval_rate_7d is the rolling figure the 30
--   percent threshold is judged on.
-- * players gains created_at (backfilled from auth.users), trial_ends_at
--   and the comp columns. None is added to authenticated's update grant.
-- * Forward-only and additive, like every migration here.

-- ---------------------------------------------------------------------------
-- players: sign-up date, trial end, comps.
-- ---------------------------------------------------------------------------
alter table public.players
  add column created_at timestamptz not null default now(),
  add column trial_ends_at timestamptz,
  add column comp_tier text check (comp_tier in ('pro', 'elite')),
  add column comp_until timestamptz,
  add column comp_previous_tier text;

update public.players p
set created_at = u.created_at
from auth.users u
where u.id = p.id;

-- ---------------------------------------------------------------------------
-- admin_users (PRD-13 section 6, TECH-ARCHITECTURE.md 2.4).
-- ---------------------------------------------------------------------------
create table public.admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('support', 'ops', 'owner')),
  granted_by uuid references public.admin_users (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  passkey_registered_at timestamptz,
  last_seen_at timestamptz
);

comment on table public.admin_users is
  'Staff identities for the admin console (PRD-13 AD-1, AD-2). One role per person. Never a player: see the two not-a-player triggers.';

create unique index admin_users_email_lower_idx on public.admin_users (lower(email));

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create function public.admin_users_not_a_player()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.players p
    where p.id = new.id or lower(p.email) = lower(new.email)
  ) then
    raise exception 'A player identity cannot hold a staff role (PRD-13 AD-1)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger admin_users_not_a_player
  before insert or update of id, email on public.admin_users
  for each row execute function public.admin_users_not_a_player();

create function public.players_not_staff()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.admin_users a
    where (a.id = new.id or lower(a.email) = lower(new.email)) and a.revoked_at is null
  ) then
    raise exception 'A staff identity cannot hold a player account (PRD-13 AD-1)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger players_not_staff
  before insert on public.players
  for each row execute function public.players_not_staff();

revoke execute on function public.admin_users_not_a_player() from public, anon, authenticated;
revoke execute on function public.players_not_staff() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_actions: admin name snapshot, ip, FK now that admin_users exists.
-- ---------------------------------------------------------------------------
alter table public.admin_actions
  add column admin_name text,
  add column ip text,
  add constraint admin_actions_admin_fk foreign key (admin_id) references public.admin_users (id);

-- The player sees name, role, action, consequence and reason; device and ip
-- stay staff-only (PRD-13 section 10).
revoke select on public.admin_actions from authenticated;
grant select (
  id, player_id, action_type, consequence, reason, role_at_time, admin_name,
  notified_player, created_at
) on public.admin_actions to authenticated;

-- ---------------------------------------------------------------------------
-- admin_action_consumptions: the admin-action gate's claim (append-only).
-- ---------------------------------------------------------------------------
create table public.admin_action_consumptions (
  admin_action_id uuid primary key references public.admin_actions (id),
  consumed_at timestamptz not null default now()
);

comment on table public.admin_action_consumptions is
  'One row per admin action whose side effect (an email, a sign-in link) has run. The primary key is the one-time claim, like approval_consumptions.';

alter table public.admin_action_consumptions enable row level security;
revoke all on public.admin_action_consumptions from anon, authenticated;
revoke update, delete on public.admin_action_consumptions from service_role;

-- ---------------------------------------------------------------------------
-- agent_global_pauses (AD-15): platform-wide pause per agent, append-only.
-- ---------------------------------------------------------------------------
create table public.agent_global_pauses (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  paused boolean not null,
  changed_by uuid references public.admin_users (id),
  reason text,
  changed_at timestamptz not null default now()
);

create index agent_global_pauses_agent_idx on public.agent_global_pauses (agent_name, changed_at desc);

alter table public.agent_global_pauses enable row level security;
revoke all on public.agent_global_pauses from anon, authenticated;
revoke update, delete on public.agent_global_pauses from service_role;

-- Players read the pause state (never who or why) to show AD-15's notice.
grant select (agent_name, paused, changed_at) on public.agent_global_pauses to authenticated;
create policy agent_global_pauses_read on public.agent_global_pauses
  for select to authenticated using (true);

-- Same for provider switches (AD-16's Match Scribe notice).
grant select (provider, state, changed_at) on public.provider_switches to authenticated;
create policy provider_switches_read on public.provider_switches
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- run_failures (AD-14): one row per failing run, from the first attempt.
-- ---------------------------------------------------------------------------
create table public.run_failures (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  player_id uuid not null references public.players (id) on delete cascade,
  scheduled_window text not null,
  trigger_type text not null,
  attempts integer not null default 1,
  last_error text not null,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  exhausted_at timestamptz,
  player_told_at timestamptz,
  resolved_at timestamptz,
  resolution text check (resolution in ('succeeded', 'retried', 'dismissed')),
  dismissed_reason text,
  constraint run_failures_dismiss_reason check (resolution is distinct from 'dismissed' or dismissed_reason is not null),
  unique (agent_name, player_id, scheduled_window)
);

create index run_failures_open_idx on public.run_failures (resolved_at, last_failed_at);

alter table public.run_failures enable row level security;
revoke all on public.run_failures from anon, authenticated;

-- ---------------------------------------------------------------------------
-- agent_health_daily (AD-13): the nightly aggregation's output.
-- ---------------------------------------------------------------------------
create table public.agent_health_daily (
  agent text not null,
  day date not null,
  runs integer not null,
  successes integer not null,
  success_rate numeric,
  p50_ms integer,
  p95_ms integer,
  cost_total numeric not null default 0,
  cost_currency char(3) not null default 'USD',
  cost_per_run numeric,
  proposal_runs integer not null default 0,
  approved_within_48h integer not null default 0,
  approval_rate_7d numeric,
  dismissed integer,
  dismiss_rate_7d numeric,
  computed_at timestamptz not null default now(),
  primary key (agent, day)
);

alter table public.agent_health_daily enable row level security;
revoke all on public.agent_health_daily from anon, authenticated;

-- ---------------------------------------------------------------------------
-- alerts: dedupe, player link, per-role routing (AD-27).
-- ---------------------------------------------------------------------------
alter table public.alerts
  add column player_id uuid references public.players (id) on delete cascade,
  add column dedupe_key text;

create unique index alerts_dedupe_idx on public.alerts (dedupe_key) where dedupe_key is not null;

create table public.alert_routes (
  role text not null check (role in ('support', 'ops', 'owner')),
  alert_kind text not null,
  push boolean not null default false,
  email boolean not null default false,
  updated_by uuid references public.admin_users (id),
  updated_at timestamptz not null default now(),
  primary key (role, alert_kind)
);

alter table public.alert_routes enable row level security;
revoke all on public.alert_routes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- cases: the distress confirmation and escalation (AD-25, AD-AC-12).
-- ---------------------------------------------------------------------------
alter table public.cases
  add column card_shown_confirmed_at timestamptz,
  add column escalated_at timestamptz,
  add constraint cases_distress_needs_confirmation check (
    kind <> 'distress' or resolved_at is null or card_shown_confirmed_at is not null
  );

-- ---------------------------------------------------------------------------
-- The console role's explicit grant list (TECH-ARCHITECTURE.md 2.4).
-- ---------------------------------------------------------------------------
grant usage on schema public to console;

-- players: account-level columns only. No emergency_contact, no deletion token.
grant select (
  id, tour, name, email, country, dob, guardian_email, guardian_confirmed_at,
  verification, verification_source, home_currency, app_language, spoken_language,
  timezone, stage, stage_pinned, tier, tier_status, billing_cycle, tour_player_id,
  itf_id, tour_rank, tour_points, itf_rank, dashboard_state, onboarding_started_at,
  onboarding_finished_at, deletion_requested_at, deletion_effective_at,
  deletion_cancelled_at, export_requested_at, export_delivered_at, created_at,
  trial_ends_at, comp_tier, comp_until, comp_previous_tier
) on public.players to console;
grant update (
  tier, tier_status, trial_ends_at, comp_tier, comp_until, comp_previous_tier,
  deletion_requested_at, deletion_effective_at, deletion_cancelled_at,
  verification, verification_source
) on public.players to console;

-- notes: existence and timing only (last active, backlog). Never content.
grant select (id, player_id, recorded_at, created_at, status, deleted_at) on public.notes to console;
-- check_ins: existence only; value and sentence are the mood.
grant select (id, player_id, date, created_at) on public.check_ins to console;

grant select (
  id, agent_name, player_id, trigger_type, started_at, completed_at, model, status,
  cost_amount, cost_currency
) on public.agent_runs to console;
grant select (id, player_id, action_type, agent_run_id, approved_at) on public.approvals to console;
grant select on public.approval_consumptions to console;

grant select (player_id, agent_name, paused, updated_at) on public.agent_schedules to console;
grant insert (player_id, agent_name, paused, updated_at) on public.agent_schedules to console;
grant update (paused, updated_at) on public.agent_schedules to console;

grant select (id, player_id, scope, created_at, expires_at, renewed_at, revoked, last_opened_at, open_count)
  on public.share_links to console;
grant update (revoked) on public.share_links to console;

grant insert (player_id, agent, category, title, body, action_href) on public.notifications to console;

grant select on public.admin_users to console;
grant update (passkey_registered_at, last_seen_at) on public.admin_users to console;
grant select, insert on public.admin_actions to console;
grant select, insert on public.admin_action_consumptions to console;
grant select, insert on public.agent_global_pauses to console;
grant select, insert on public.provider_switches to console;
grant select on public.run_failures to console;
grant update (attempts, resolved_at, resolution, dismissed_reason) on public.run_failures to console;
grant select on public.agent_health_daily to console;
grant select, insert on public.alerts to console;
grant update (acknowledged_by, acknowledged_at) on public.alerts to console;
grant select, insert, update on public.alert_routes to console;
grant select on public.cases to console;
grant update (outcome, resolved_by, resolved_at, card_shown_confirmed_at) on public.cases to console;

grant select on public.feed_status, public.snapshot_imports, public.fact_corrections, public.tournaments to console;
grant select (id, player_id, tournament_id, status) on public.entry_decisions to console;
grant select (id, player_id, status, created_at) on public.patron_updates to console;
grant select (id, player_id, dismissed, dismissed_at) on public.patterns to console;
grant select on public.fx_rates_daily to console;

-- Money: amounts and states, never patron names, emails or notes.
grant select on public.payouts to console;
grant select (id, player_id, tier_id, status, price, currency, since, left_at, paused_at, created_at)
  on public.patrons to console;
grant select (player_id, kyc_status, charges_enabled, payouts_enabled, created_at)
  on public.patron_programmes to console;
grant select (id, player_id, joined_at, invited_at, converted_at) on public.patron_waitlist to console;

-- A permissive console policy on every table it touches; the grants above
-- are the real limit.
do $$
declare
  t text;
begin
  foreach t in array array[
    'players', 'notes', 'check_ins', 'agent_runs', 'approvals', 'approval_consumptions',
    'agent_schedules', 'share_links', 'notifications', 'admin_users', 'admin_actions',
    'admin_action_consumptions', 'agent_global_pauses', 'provider_switches', 'run_failures',
    'agent_health_daily', 'alerts', 'alert_routes', 'cases', 'feed_status',
    'snapshot_imports', 'fact_corrections', 'tournaments', 'entry_decisions',
    'patron_updates', 'patterns', 'fx_rates_daily', 'payouts', 'patrons',
    'patron_programmes', 'patron_waitlist'
  ] loop
    execute format('create policy console_all on public.%I for all to console using (true) with check (true)', t);
  end loop;
end
$$;

-- Append-only stays append-only for the console too.
revoke update, delete on public.admin_actions, public.admin_action_consumptions,
  public.agent_global_pauses, public.provider_switches from console;

comment on role console is
  'Admin console database role (TECH-ARCHITECTURE.md 2.4). apps/api sets it per transaction. Explicit column grants only (step 5.1 migration); never notes content, audio, moods, Fuel photos, patron identities or share tokens.';
