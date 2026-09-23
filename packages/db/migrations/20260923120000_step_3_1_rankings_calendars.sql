-- Step 3.1: Rankings and calendars, with the manual path first.
-- Source: TECH-ARCHITECTURE.md section 4 and section 10 (risk list), PRD-13
-- section 4.5 and AD-17 to AD-21, PRD-00 section 3 (M-STG-1 to M-STG-4).
--
-- Design notes (see docs/BUILD-LOG.md for the full write-up):
-- * ranking_snapshots doubles as both things TECH-ARCHITECTURE.md 2.2 needs
--   it to be: the per-player weekly history (player_id set) AND the
--   matching directory the onboarding ranking lookup searches (player_id
--   null), because a brand-new sign-up has no players row yet to hang a
--   snapshot off (players' own first-ever INSERT policy, step 1.4, means no
--   row exists before finishOnboarding runs) but still needs to be found by
--   tour_player_id/itf_id/name+country. A CSV/feed import writes one row per
--   person per week regardless of ProCircuit signup status: rows that match
--   an existing player's tour_player_id/itf_id get player_id set (and
--   become that player's history); rows that match nobody stay player_id
--   null, available to a future onboarding lookup and reported as
--   "unmatched" in the admin preview (AD-18). No separate directory table
--   is invented for this; the shape TECH-ARCHITECTURE.md already specifies
--   already supports it once player_id is nullable.
-- * The real production RankingLookupAdapter (apps/api/src/rankings) reads
--   this table read-only; it does not write to it. A newly onboarded
--   player's own row already carries tour_rank/tour_points/itf_rank/wtn/
--   verification from finishOnboarding's own upsert (step 1.4, unchanged by
--   this migration — see the deferral note below), so their dashboard is
--   correct from the moment they finish onboarding; their first linked
--   ranking_snapshots row, and everyone else's weekly update, comes from
--   the next CSV import that matches their tour_player_id/itf_id against
--   players, which is also `players.stage`'s only other writer (detectStage
--   on every refresh, M-STG-1), by design never overwriting stage when
--   stage_pinned is true (M-STG-2).
-- * Deliberately deferred, not solved here: step 2.3's own migration
--   comment named "verification, tour_rank, tour_points, itf_rank, wtn" as
--   columns whose player-writable grant this step should lock down, since
--   after this step they become server/feed-driven rather than
--   player-asserted. Doing that safely means moving finishOnboarding's
--   ranking-field writes to run server-side (through the service role,
--   immediately after a legitimate /rankings/lookup call) rather than
--   trusting the client-submitted onboarding payload for those fields —
--   a real refactor of the onboarding write path, not a column-grant
--   one-liner, and risks breaking onboarding and its "Replay setup" flow
--   (packages/db/src/players.ts's finishOnboarding, which upserts all of
--   those columns via the player's own RLS session) if rushed. Flagged here
--   as a named follow-up rather than attempted inside an already-large
--   step; players' column grants are unchanged by this migration.
-- * ledger_lines.tournament_id and prize_receivables.tournament_id stay
--   plain, FK-less uuids. Step 2.1's migration deferred that FK to "step
--   3.1... rather than reordering build-plan steps"; step 2.2's migration
--   then pointed ledger_lines.tournament_id at budget_estimates.id instead
--   (a player's own free-text trip, not feed data) and flagged reconciling
--   that against the real tournaments table as "step 3.1's problem to
--   solve." Reconciling it now would be premature: nothing writes a real
--   tournament-linked ledger line or entry_decisions row until step 3.2's
--   Tournament Agent (Accept entry -> a planned ledger line) exists at all.
--   Forcing an FK either way today would either break budget_estimates'
--   existing use of that column or add a constraint nothing yet exercises.
--   Deferred again, now to step 3.2, which is the step that actually
--   creates tournament-linked ledger lines.
-- * feed_status, snapshot_imports, fact_corrections and alerts are staff/ops
--   tables (TECH-ARCHITECTURE.md 2.4) with row level security enabled and
--   *no* policy granted to anon or authenticated at all — the same
--   deny-by-default shape a table gets when no policy is written, matching
--   how admin_actions and the rest of section 2.4's tables are described as
--   "the console's database role can read/write" once that role exists
--   (step 5.1). Until then, apps/api's service role (which bypasses RLS
--   entirely, by Postgres/Supabase design, not by a grant here) is the only
--   thing that can touch them; that is also apps/admin's only path to them
--   this step (see the design note in apps/api/src/rankings/admin-routes.ts
--   about deliberately shipping without staff auth this session).
-- * tournaments is shared reference data (TECH-ARCHITECTURE.md 2.2: "not
--   per-player"), so unlike every other table in this migration it gets a
--   plain select-all policy for any signed-in player rather than a
--   select_own — there is no player to scope it to, and Tournament Agent
--   (step 3.2) and the calendar tab both need every player to read the same
--   rows.

-- ---------------------------------------------------------------------------
-- ranking_snapshots: one row per person per week, tour singles and doubles
-- plus ITF (M-STG-1, M-STG-3, M-STG-4). See design note above for why
-- player_id is nullable.
-- ---------------------------------------------------------------------------
create table public.ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players (id) on delete cascade,
  tour text not null check (tour in ('atp', 'wta')),
  tour_player_id text,
  itf_id text,
  name text not null,
  country text not null,
  week_start date not null,
  tour_singles_rank integer,
  tour_singles_points integer,
  tour_doubles_rank integer,
  tour_doubles_points integer,
  itf_rank integer,
  itf_points integer,
  points_by_tournament jsonb not null default '[]'::jsonb,
  source text not null default 'csv_import' check (source in ('csv_import', 'feed')),
  created_at timestamptz not null default now(),
  constraint ranking_snapshots_has_an_identity check (tour_player_id is not null or itf_id is not null)
);

comment on table public.ranking_snapshots is
  'One row per person per weekly refresh (M-STG-1, M-STG-3, M-STG-4). player_id is set once matched to a signed-up player (that player''s auditable history); null rows are unmatched feed/CSV entries kept as the onboarding lookup''s matching directory. Append-only: never updated, only superseded by a later week_start.';

-- Partial uniques rather than one compound unique: a person may carry only
-- one of the two external ids, and the same identity must not get two rows
-- in the same weekly import.
create unique index ranking_snapshots_tour_player_week_uq
  on public.ranking_snapshots (tour, tour_player_id, week_start)
  where tour_player_id is not null;
create unique index ranking_snapshots_itf_week_uq
  on public.ranking_snapshots (tour, itf_id, week_start)
  where itf_id is not null;
create index ranking_snapshots_player_week_idx
  on public.ranking_snapshots (player_id, week_start desc);
create index ranking_snapshots_week_idx on public.ranking_snapshots (week_start desc);
create index ranking_snapshots_name_country_idx
  on public.ranking_snapshots (lower(name), country);

alter table public.ranking_snapshots enable row level security;

create policy ranking_snapshots_select_own on public.ranking_snapshots
  for select
  to authenticated
  using (player_id is not null and player_id = auth.uid());

-- No insert/update/delete policy for anon or authenticated: every write is
-- the CSV/feed import path, which runs on apps/api's service role and so
-- bypasses RLS by design, the same idiom prize_receivables' service-only
-- writes already use (step 2.1).

-- ---------------------------------------------------------------------------
-- tournaments: shared reference data, not per-player (TECH-ARCHITECTURE.md
-- 2.2). The manual path first: rows exist from a seed/fixture today; a real
-- CSV or licensed-feed import is a later step's job once one is signed
-- (TECH-ARCHITECTURE.md section 4's honest risk statement).
-- ---------------------------------------------------------------------------
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  tour text not null check (tour in ('atp', 'wta', 'itf_men', 'itf_women')),
  name text not null,
  tier text,
  surface text check (surface in ('clay', 'hard', 'indoor_hard', 'grass')),
  indoor_outdoor text check (indoor_outdoor in ('indoor', 'outdoor')),
  city text,
  country text,
  lat numeric,
  lon numeric,
  altitude_m numeric,
  start_date date not null,
  end_date date not null,
  entry_deadline date,
  acceptance_status text,
  last_year_cut integer,
  prize_table jsonb not null default '{}'::jsonb,
  points_table jsonb not null default '{}'::jsonb,
  ball text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tournaments is
  'Shared calendar reference data (TECH-ARCHITECTURE.md 2.2), not per-player. entry_deadline is nullable: PRD-13 AD-21 lists events with no published deadline yet, set later by ops.';

create index tournaments_tour_start_idx on public.tournaments (tour, start_date);
create index tournaments_entry_deadline_idx on public.tournaments (entry_deadline);

alter table public.tournaments enable row level security;

create policy tournaments_select_all on public.tournaments
  for select
  to authenticated
  using (true);

-- No write policy for anon or authenticated: tournament data is ops/feed
-- owned (service role only), same reasoning as ranking_snapshots above.

-- ---------------------------------------------------------------------------
-- feed_status, snapshot_imports, fact_corrections, alerts: staff/ops tables
-- (TECH-ARCHITECTURE.md 2.4). Deny-by-default RLS, service role only; see
-- design note above.
-- ---------------------------------------------------------------------------
create table public.feed_status (
  id uuid primary key default gen_random_uuid(),
  feed text not null unique
    check (feed in ('atp_rankings', 'wta_rankings', 'itf_men_rankings', 'itf_women_rankings')),
  cadence text not null default 'weekly',
  last_run_at timestamptz,
  last_result text,
  next_expected_at timestamptz not null,
  row_count integer,
  issues jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.feed_status is
  'PRD-13 AD-17: cadence, last/next run and a detail line per ranking feed, shown as cards on the ingestion page and checked by the missed-window alert.';

alter table public.feed_status enable row level security;

create table public.snapshot_imports (
  id uuid primary key default gen_random_uuid(),
  file_hash text not null,
  rows integer not null,
  matched integer not null default 0,
  unmatched jsonb not null default '[]'::jsonb,
  stage_changes integer not null default 0,
  applied_by text,
  applied_at timestamptz not null default now()
);

comment on table public.snapshot_imports is
  'PRD-13 AD-18: one row per applied ranking CSV import, with the per-player change count and the unmatched-row list shown in the admin preview. applied_by is free text until step 5.1''s admin_users exists.';

alter table public.snapshot_imports enable row level security;

create table public.fact_corrections (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  field text not null,
  before text,
  after text not null,
  source text not null,
  proposed_by text,
  state text not null default 'proposed' check (state in ('proposed', 'applied', 'rejected')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.fact_corrections is
  'PRD-13 AD-20: proposed tournament fact-sheet changes (ball, deadline, altitude, surface) with a before/after diff, applied or rejected by ops.';

create index fact_corrections_tournament_idx on public.fact_corrections (tournament_id);

alter table public.fact_corrections enable row level security;

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  category text not null check (category in ('act', 'fyi')),
  title text not null,
  body text not null,
  link text,
  role_owner text,
  acknowledged_by text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.alerts is
  'PRD-13 4.8: platform alerts (this step only writes kind=feed_missed_window, AD-17''s "raises an alert when a feed misses its expected window"). The full alerts sheet UI is step 5.2''s job; this step only needs the row to exist and be queryable for the ingestion page''s Attention badge.';

alter table public.alerts enable row level security;
