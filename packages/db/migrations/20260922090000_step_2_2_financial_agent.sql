-- Step 2.2: Financial Agent.
-- Source: PRD-03 (all), decisions worksheet 5, 6, 7, TECH-ARCHITECTURE.md
-- section 3.
--
-- Design notes (see docs/BUILD-LOG.md for the full write-up):
-- * The runway/burn/projection engine, the monthly P&L and receipt scanning
--   all read ledger_lines, reserve_entries, prize_receivables and
--   fx_rates_daily as they already stand from step 2.1 — no changes needed
--   there, and approvals.action_type already carries 'expense_save' and
--   'balance_update' from the very first (step 0.2) migration. Both stay
--   plain, RLS-scoped writes via packages/db's existing insertLedgerLine and
--   enterReserveBalance (TECH-ARCHITECTURE.md section 1: "Next.js server
--   actions handle simple CRUD directly against the database"), the same
--   read as step 2.1's own migration comment drew for reserve_entries
--   ("the opposite" of the two named actions-module transitions in section
--   3, which are exactly Stripe/Resend/ICS/entry-client and the two named
--   DB transitions — expense_save/balance_update are neither). This
--   migration only adds what step 2.1 didn't need: budget estimates, the
--   weekly budget setting and the "one thing" snooze state.
-- * budget_estimates doubles as the player's own named upcoming trips for
--   budgeting purposes (F-16's "per estimated tournament"), not a join to a
--   real tournaments table: that table doesn't exist until step 3.1, which
--   is *after* this step in the build plan, and PRD-03's own fixtures
--   (Genoa, Sibiu, Poznań) are free-text labels a player typed, not feed
--   data. ledger_lines.tournament_id already has no foreign key ("the
--   tournaments table doesn't exist until step 3.1... the FK is added then
--   rather than reordering build-plan steps" — step 2.1's own migration), so
--   pointing a ledger line's tournament_id at a budget_estimates.id here is
--   consistent with that same deferral, not a new one. Step 3.1 will need to
--   reconcile this against the real tournaments table; that is that step's
--   problem to solve, flagged here rather than solved by inventing a feed
--   this step doesn't have.
-- * budget_estimates has no update policy: PRD-03's data dictionary lists a
--   "status" field (active/superseded) implying estimates get revised over
--   time with history kept, so a revision is a new inserted row, and "the
--   current estimate" for a label is simply its latest active row by
--   estimated_at — append-only, the same shape ledger_lines and
--   reserve_entries already use for audit rows.
-- * financial_action_snoozes is a plain player-typed append-only log ("Not
--   this week" snoozes the current top candidate until Monday 07:00,
--   F-18/F-AC-10); the caller reads the latest row per candidate_key and
--   compares snoozed_until against now, the same "latest row wins" idiom as
--   reserve_entries' balance history.
-- * PRD-03 F-17's weekly travel budget already has a home: `players.weekly_budget`,
--   added in the step 1.4 onboarding migration and already collected by the
--   onboarding wizard (defaulting to 1,200, the same number PRD-03's own
--   "Budget A$1,200/wk" example uses). No new column needed; this step just
--   reads and displays it (and lets it be edited) via packages/db's new
--   setWeeklyBudget.

-- ---------------------------------------------------------------------------
-- budget_estimates: per-trip budget the player set, for Budget vs actual
-- (PRD-03 F-16). See design note above for why this stands in for a
-- tournament reference until step 3.1's real tournaments table exists.
-- ---------------------------------------------------------------------------
create table public.budget_estimates (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  label text not null,
  estimate_amount numeric not null check (estimate_amount > 0),
  currency char(3) not null,
  estimated_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'superseded')),
  created_at timestamptz not null default now()
);

comment on table public.budget_estimates is
  'A player-set budget for a named upcoming trip (PRD-03 F-16, "Estimate"/EST). id doubles as ledger_lines.tournament_id until step 3.1''s real tournaments table exists (see migration design note). Append-only: a revised estimate is a new row; the current one for a label is its latest status=active row by estimated_at.';

create index budget_estimates_player_idx on public.budget_estimates (player_id, estimated_at);

alter table public.budget_estimates enable row level security;

create policy budget_estimates_select_own on public.budget_estimates
  for select
  to authenticated
  using (player_id = auth.uid());

create policy budget_estimates_insert_own on public.budget_estimates
  for insert
  to authenticated
  with check (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- financial_action_snoozes: "Not this week" state for the one-thing card
-- (PRD-03 F-18, F-AC-10).
-- ---------------------------------------------------------------------------
create table public.financial_action_snoozes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  candidate_key text not null,
  snoozed_until timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.financial_action_snoozes is
  'Records a player tapping "Not this week" on a one-thing candidate (PRD-03 F-18). The latest row per (player_id, candidate_key) with snoozed_until in the future excludes that candidate from every run until it passes.';

create index financial_action_snoozes_player_key_idx
  on public.financial_action_snoozes (player_id, candidate_key, snoozed_until);

alter table public.financial_action_snoozes enable row level security;

create policy financial_action_snoozes_select_own on public.financial_action_snoozes
  for select
  to authenticated
  using (player_id = auth.uid());

create policy financial_action_snoozes_insert_own on public.financial_action_snoozes
  for insert
  to authenticated
  with check (player_id = auth.uid());
