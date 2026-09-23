-- Step 3.2: Tournament Agent.
-- Source: PRD-01 (all), PRD-00 section 3, decisions worksheet 14,
-- TECH-ARCHITECTURE.md section 2.2 (entry_decisions' own already-specified
-- shape) and section 3 (the actions-module gate).
--
-- Design notes (see docs/BUILD-LOG.md for the full write-up):
-- * entry_decisions matches TECH-ARCHITECTURE.md 2.2's own field list
--   verbatim (it was named, unbuilt, since the very first architecture
--   pass): id, player_id, tournament_id, status, planned_expense_id,
--   decided_at, device. planned_expense_id -> ledger_lines.id "on entry",
--   per that same section.
-- * Only two of the four status transitions are player-direct writes: Skip
--   (none -> skipped) and Undo (skipped -> none), T-10/T-11. Accept entry
--   (-> entered) and Withdraw (-> withdrawn) are the actions-module's job:
--   section 3 names "write an entry_decisions row to entered" as gated
--   exactly like a Stripe/Resend/ICS call, and approvals.action_type has
--   carried 'entry_confirm' and 'retract' unused since the very first
--   (step 0.2) migration for exactly this. Rather than a trigger, this is
--   enforced the simple way: no INSERT policy for authenticated at all (a
--   row is created by the scheduled run, service role, for every
--   shortlisted candidate before the player ever sees it — the same
--   "system creates it, player only ever edits" shape ranking_snapshots
--   already uses), and an UPDATE policy whose WITH CHECK only admits
--   status in ('none','skipped') with planned_expense_id staying null —
--   so a player session can never write 'entered' or 'withdrawn' or touch
--   planned_expense_id, however the request is shaped. The two gated
--   transitions run on the service role (packages/actions'
--   confirmEntry/withdrawEntry), which bypasses RLS entirely by Postgres/
--   Supabase design, same as markReceivableReceived (step 2.1).
-- * shortlist_candidates is the persisted numeric output of the latest run
--   per candidate (cost breakdown, ratio, outcome rounds, expected/worst/
--   best net, why text) — needed because T-14 requires decisions and,
--   after an update, ratio et al. to persist across a Sunday re-rank
--   rather than being recomputed fresh every page load from nothing (there
--   is no live "cost API" to recompute against; the shortlist run is the
--   only writer). One row per (player_id, tournament_id), upserted each
--   run; `current` distinguishes "in this week's ranked five" from "an
--   older candidate kept visible only because it still has a decision"
--   (T-14's "stays visible... with an 'excluded next week' note"), so a
--   client can tell those two states apart without re-deriving them.
--   Service-role write only, same reasoning as ranking_snapshots and
--   tournaments (step 3.1): every row here is system-computed, never
--   player-asserted.
-- * ledger_lines.tournament_id already points at budget_estimates.id (step
--   2.2, reconciliation explicitly deferred by step 3.1's own migration
--   comment to "step 3.2, which is the step that actually creates
--   tournament-linked ledger lines"). Repointing that column's semantics
--   would be a breaking, non-additive change to every existing reader
--   (Financial Agent's budget-vs-actual, P&L labelling), so this migration
--   adds a second, purpose-built column instead: real_tournament_id,
--   nullable, FK to the real tournaments table, set only by confirmEntry's
--   planned line and read only by the Tournament Agent's own views. Full
--   reconciliation (e.g. budget-vs-actual joining through the real
--   tournaments table too) stays a named follow-up, not solved here.
-- * players gains three columns the cost model and the detail panel's route
--   line need and that genuinely don't exist anywhere yet: home_airport (an
--   IATA code, T-5's "route (origin, stops, duration)"), coach_weekly_fee
--   and coach_travels (T-5's "Coach block when non-zero"). All three are
--   plain player-set profile facts (Settings, not modelled this step) with
--   no consequence beyond feeding the cost model, so they join the existing
--   player-writable grant list below rather than getting their own gate.
create table public.entry_decisions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id),
  status text not null default 'none' check (status in ('none', 'entered', 'skipped', 'withdrawn')),
  planned_expense_id uuid references public.ledger_lines (id) on delete set null,
  decided_at timestamptz,
  device text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entry_decisions_player_tournament_uq unique (player_id, tournament_id)
);

comment on table public.entry_decisions is
  'PRD-01 T-9 to T-11. status transitions to entered/withdrawn only through packages/actions'' confirmEntry/withdrawEntry (action_type entry_confirm/retract), the service role; a player session can only move none<->skipped (Skip/Undo) via the update policy below. One row per shortlisted candidate, created by the scheduled run before the player ever sees it.';

create index entry_decisions_player_idx on public.entry_decisions (player_id);
create index entry_decisions_tournament_idx on public.entry_decisions (tournament_id);

alter table public.entry_decisions enable row level security;

create policy entry_decisions_select_own on public.entry_decisions
  for select
  to authenticated
  using (player_id = auth.uid());

create policy entry_decisions_update_own on public.entry_decisions
  for update
  to authenticated
  using (player_id = auth.uid())
  with check (
    player_id = auth.uid()
    and status in ('none', 'skipped')
    and planned_expense_id is null
  );

-- No insert/delete policy for authenticated: rows are created by the
-- scheduled run (service role) and never deleted. See design note above.

-- ---------------------------------------------------------------------------
-- shortlist_candidates: the persisted numeric output of the latest shortlist
-- run per candidate (PRD-01 section 6's "Tournament candidate"). See design
-- note above.
-- ---------------------------------------------------------------------------
create table public.shortlist_candidates (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id),
  run_id uuid references public.agent_runs (id),
  rank integer not null,
  ratio numeric not null,
  cost jsonb not null,
  rounds jsonb not null default '[]'::jsonb,
  exp numeric not null,
  lo numeric not null,
  hi numeric not null,
  acceptance_status text not null,
  defend_points integer,
  why text not null,
  current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shortlist_candidates_player_tournament_uq unique (player_id, tournament_id)
);

comment on table public.shortlist_candidates is
  'PRD-01 section 6. One row per (player_id, tournament_id), upserted by every scheduled run; current=false marks a candidate a later run dropped but that still has a non-none entry_decisions status (T-14''s "excluded next week" note). cost/rounds shapes match packages/agents/src/tournament''s CandidateCost/RoundOutcome types.';

create index shortlist_candidates_player_idx on public.shortlist_candidates (player_id, rank);

alter table public.shortlist_candidates enable row level security;

create policy shortlist_candidates_select_own on public.shortlist_candidates
  for select
  to authenticated
  using (player_id = auth.uid());

-- No write policy for authenticated: every row is system-computed by the
-- scheduled run (service role), same reasoning as ranking_snapshots and
-- tournaments (step 3.1).

-- ---------------------------------------------------------------------------
-- ledger_lines: a second, purpose-built tournament reference. See design
-- note above for why the existing tournament_id column is left untouched.
-- ---------------------------------------------------------------------------
alter table public.ledger_lines
  add column real_tournament_id uuid references public.tournaments (id);

comment on column public.ledger_lines.real_tournament_id is
  'Set only by confirmEntry''s planned expense line (PRD-01 T-9). Distinct from tournament_id, which points at budget_estimates.id (step 2.2) and stays that way; see this migration''s design notes for the reconciliation this deliberately does not attempt.';

create index ledger_lines_real_tournament_idx on public.ledger_lines (real_tournament_id);

-- ---------------------------------------------------------------------------
-- players: three new profile columns the cost model and the detail panel's
-- route line need. See design note above.
-- ---------------------------------------------------------------------------
alter table public.players
  add column home_airport text,
  add column coach_weekly_fee numeric,
  add column coach_travels boolean not null default false;

comment on column public.players.home_airport is
  'IATA code, player-set. PRD-01 T-5''s flight route line ("origin, stops, duration") and the cost model''s flight estimate both read this; null means the cost model falls back to a platform-median flight estimate with no route line shown.';
comment on column public.players.coach_weekly_fee is
  'Home-currency weekly fee, player-set. PRD-01 T-5''s "Coach block when non-zero" cost line; null/0 means no coach block is added.';
comment on column public.players.coach_travels is
  'Whether the coach travels with the player (and so is added to every shortlisted week''s cost) or is a home-based, video-call arrangement (no per-week cost). Defaults false so onboarded players without this set see no unexpected coach cost.';

-- ---------------------------------------------------------------------------
-- players column-grant lockdown: the three new columns above join the list.
-- ---------------------------------------------------------------------------
revoke update on public.players from authenticated;

grant update (
  id, tour, name, email, country, dob, guardian_email, guardian_confirmed_at,
  verification, verification_source, home_currency, patron_language, app_language,
  units, timezone, stage, stage_pinned, tier, tier_status,
  handed, tour_player_id, itf_id, tour_rank, tour_points, itf_rank, wtn,
  target_rank, key_tournaments, surfaces, weekly_budget, blocked_dates,
  billing_cycle, dashboard_state, onboarding_started_at, onboarding_finished_at,
  spoken_language, date_format, quiet_hours_start, quiet_hours_end,
  notification_prefs, emergency_contact, reserve_reminder_enabled,
  home_airport, coach_weekly_fee, coach_travels
) on public.players to authenticated;

-- approvals.action_type is unchanged: 'entry_confirm' and 'retract' have
-- been in the check constraint since the step 0.2 migration, unused until
-- now.
