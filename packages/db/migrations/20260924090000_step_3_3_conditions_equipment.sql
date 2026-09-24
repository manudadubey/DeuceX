-- Step 3.3: Conditions and Equipment.
-- Source: PRD-08 (all), PROCIRCUIT-CONTEXT.md 5.4, TECH-ARCHITECTURE.md 2.2
-- (both tables were named, unbuilt, since the very first architecture pass:
-- "equipment_profile" and "conditions_briefs" appear in section 2.2's own
-- core-entities table).
--
-- Design notes (see docs/BUILD-LOG.md for the full write-up):
-- * equipment_profile is genuinely player-writable (Settings > Equipment
--   saves it directly, PRD-08 section 4.5), unlike shortlist_candidates or
--   conditions_briefs below — so it gets the ordinary select_own/insert_own/
--   update_own RLS shape (players.tier_status's own shape from step 0.2),
--   not the "system writes, player only reads" shape step 3.1/3.2 use for
--   computed rows. player_id is the primary key (PRD-08 section 6: "one
--   profile"), not a separate id, matching TECH-ARCHITECTURE.md 2.2's own
--   field list for this table exactly.
-- * conditions_briefs is the persisted output of the Conditions layer's own
--   deterministic rules plus its one batched prose call (PRD-08 section 3:
--   "runs inside every Tournament Agent run... daily inside the travel
--   window... at match note save time... when the equipment profile is
--   saved"). One row per (player_id, tournament_id), upserted on every
--   refresh — the same "system-computed, never player-asserted, no write
--   policy for authenticated" shape shortlist_candidates already uses (step
--   3.2), for the same reason: there is no live "recompute the forecast" API
--   for a client to call against, only this layer's own scheduled and
--   event-triggered runs.
-- * notes.cond (already a jsonb column since step 1.1) is what actually
--   carries a Match note's stamp — PRD-08 section 6's own words, "rendered
--   as the cond array ['33°C','82% RH','outdoor hard','Head Tour']" — and
--   apps/web/components/match-scribe/recorder-card.tsx's review step
--   (already shipped, step 1.1) already reads note.cond as a plain
--   string[] and renders it as a chip row. That is the real, load-bearing
--   contract this step writes to; no migration is needed for it. (A
--   different, incompatible guess at this column's future shape —
--   packages/agents/src/mindset-coach's MindsetConditionStamp{firstServePct,
--   tempC, humidityPct}, from step 1.3, before PRD-08 existed — is not
--   touched by this migration; see the BUILD-LOG entry for why that stays a
--   named gap rather than something this step retrofits.)
-- * No new approvals.action_type: PRD-08 section 3 is explicit that this
--   layer "changes nothing... never edits the profile, books a stringer or
--   sends anything" — the two-frame test is a proposal acted on outside the
--   app, not a gated transition. Nothing here calls packages/actions.
create table public.equipment_profile (
  player_id uuid primary key references public.players (id) on delete cascade,
  frame text,
  string text,
  tension_mains_kg numeric not null default 24,
  tension_crosses_kg numeric not null default 23,
  frames_carried integer not null default 4 check (frames_carried between 3 and 6),
  restring_cadence text not null default 'every8to10Sets'
    check (restring_cadence in ('everyMatch', 'every8to10Sets', 'whenDead')),
  overgrip text,
  practice_balls jsonb not null default '[]'::jsonb,
  stamp_switch boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.equipment_profile is
  'PRD-08 section 6. What the player plays with, owned and edited in Settings > Equipment. version increments on every save (CE-15) so a Conditions brief can be read back against the profile that produced it.';
comment on column public.equipment_profile.stamp_switch is
  'CE-11 / section 4.5: "Patterns need this on." Default on; a player can turn off automatic condition stamps on Match notes.';

alter table public.equipment_profile enable row level security;

create policy equipment_profile_select_own on public.equipment_profile
  for select
  to authenticated
  using (player_id = auth.uid());

create policy equipment_profile_insert_own on public.equipment_profile
  for insert
  to authenticated
  with check (player_id = auth.uid());

create policy equipment_profile_update_own on public.equipment_profile
  for update
  to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- conditions_briefs: the persisted output of the layer's own rules (PRD-08
-- section 6's data dictionary). See design note above.
-- ---------------------------------------------------------------------------
create table public.conditions_briefs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id),
  run_id uuid references public.agent_runs (id),
  temp_range text not null,
  temp_max numeric not null,
  rh_range text not null,
  rh_max integer not null,
  wind text not null,
  altitude_m numeric,
  ball text,
  ball_diff boolean not null default false,
  io text not null,
  diff text not null default '',
  tension boolean not null default false,
  tension_note text not null default '',
  test_mains numeric,
  test_crosses numeric,
  frames integer not null default 3,
  frames_sub_line text not null default 'Normal grip',
  grip text not null default 'Normal grip',
  practice text not null default '',
  forecast_at timestamptz not null default now(),
  forecast_source text not null default 'open-meteo' check (forecast_source in ('open-meteo', 'climate-normals')),
  refreshed boolean not null default true,
  equipment_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conditions_briefs_player_tournament_uq unique (player_id, tournament_id)
);

comment on table public.conditions_briefs is
  'PRD-08 section 6. One row per (player_id, tournament_id), upserted by every Tournament Agent run and by the daily in-window refresh (CE-1, CE-7). forecast_source=''climate-normals'' and refreshed=false together implement CE-19''s "not refreshed" Air tile. equipment_version lets a brief be read back against the equipment_profile.version that produced it (CE-12''s re-run-on-save).';
comment on column public.conditions_briefs.tension is
  'PRD-08 section 7''s tension rule outcome (CE-9). test_mains/test_crosses are null when tension=false.';

create index conditions_briefs_player_idx on public.conditions_briefs (player_id);

alter table public.conditions_briefs enable row level security;

create policy conditions_briefs_select_own on public.conditions_briefs
  for select
  to authenticated
  using (player_id = auth.uid());

-- No write policy for authenticated: every row is system-computed by the
-- scheduled/event-triggered run (service role), same reasoning as
-- shortlist_candidates (step 3.2).
