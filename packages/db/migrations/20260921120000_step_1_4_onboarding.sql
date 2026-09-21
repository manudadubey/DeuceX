-- Step 1.4: First-week dashboard and onboarding without feeds.
-- Source: PRD-11-Onboarding-Public-Profile.md (all), PRD-00 section 3 (stage
-- detection) and section 5.2 (M-ID-2, M-ID-3), decisions worksheet 1 and 2.
--
-- Design notes (see docs/BUILD-LOG.md for the full write-up):
-- * `players` had no INSERT policy at all (step 0.2 only wrote select_own and
--   update_own), because until this step nothing created a player's own row:
--   auth (step 0.3) only creates the auth.users row. Onboarding's "Open my
--   dashboard" is the first place a players row is ever written, so
--   players_insert_own is new here, not a tightening of an existing gap.
-- * No answer is persisted before the final step (PRD-11 section 3, Failure
--   behaviour: "a lost session before step 4 loses steps 1 to 3"), so this
--   migration adds columns for the whole wizard rather than a separate
--   in-progress "onboarding_sessions" table — one insert at finish, matching
--   the product's own stated design.
-- * Ranking fields are named `tour_*` rather than `atp_*`/`wta_*`: M-STG-3
--   ("no surface may hard-code ATP") applies to storage, not just labels.
--   `tour_player_id` is the ATP or WTA id depending on `players.tour`; the
--   step 1 form shows it as "ATP player ID" or "WTA player ID" by reading
--   that same column.
-- * The ranking values themselves (tour_rank, tour_points, itf_rank, wtn)
--   live directly on `players` rather than in a new `ranking_snapshots`
--   table. TECH-ARCHITECTURE.md 2.2 describes `ranking_snapshots` as "one row
--   per weekly refresh" fed by a real feed and a Monday job — neither exists
--   until step 3.1 (Rankings and calendars). This step's own adapter always
--   returns `unverified` in production (build plan step 1.4's own words), so
--   building the weekly-snapshot table now would be schema ahead of any code
--   that populates it on a schedule. A single current-value column set is
--   enough for what this step actually needs (onboarding's one-time lookup,
--   stage detection from it) and is additive to extend later.
-- * `dashboard_state` replaces the prototype's client-only `pc.state`
--   localStorage flag (docs/procircuit-dashboard.html) with a real column:
--   PRD-11 section 3 lists "the first-week state (pc.state = 'first')" as an
--   Output of onboarding, i.e. product state, not a UI-only preference.
-- * Step 4's per-agent on/off toggles do not get their own column. They map
--   directly onto the existing `agent_schedules.paused` flag (step 0.6):
--   "off" in step 4 inserts a paused=true row for that agent, "on" leaves no
--   row (agent_schedules' own documented default). `agent_schedules` had no
--   write policy for the row's own player yet (only select_own); this
--   migration adds insert_own/update_own so onboarding's finish step can
--   write it directly, the same "simple CRUD via RLS" path notes.ts uses.
alter table public.players
  add column handed text check (handed in ('right', 'left')),
  add column tour_player_id text,
  add column itf_id text,
  add column tour_rank integer,
  add column tour_points integer,
  add column itf_rank integer,
  add column wtn numeric(3, 1),
  add column target_rank integer,
  add column key_tournaments text[] not null default '{}'::text[],
  add column surfaces text[] not null default '{}'::text[],
  add column weekly_budget numeric,
  add column blocked_dates text,
  add column billing_cycle text check (billing_cycle in ('monthly', 'annual')),
  add column dashboard_state text not null default 'first'
    check (dashboard_state in ('first', 'full')),
  add column onboarding_started_at timestamptz,
  add column onboarding_finished_at timestamptz;

comment on column public.players.tour_player_id is
  'ATP or WTA id depending on players.tour (M-STG-3: never a tour-specific column name).';
comment on column public.players.dashboard_state is
  'Replaces the prototype''s client-only pc.state (PRD-11 section 3 Outputs): first until the player finishes their first week, full once TECH-ARCHITECTURE''s later agents give it real content.';

create policy players_insert_own on public.players
  for insert
  to authenticated
  with check (id = auth.uid());

create policy agent_schedules_insert_own on public.agent_schedules
  for insert
  to authenticated
  with check (player_id = auth.uid());

create policy agent_schedules_update_own on public.agent_schedules
  for update
  to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());
