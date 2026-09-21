-- Step 2.1: The FX archive and the ledger.
-- Source: TECH-ARCHITECTURE.md section 2.1, PRD-03 sections 3, 6, 7,
-- PRD-00 M-DATA-1, M-DATA-2, M-CUR-1.
--
-- Design notes (see docs/BUILD-LOG.md for the full write-up):
-- * fx_rates_daily already exists (step 0.2 migration); this migration adds
--   the three money tables it makes meaningful: ledger_lines,
--   prize_receivables, reserve_entries.
-- * TECH-ARCHITECTURE.md section 3 names one specific transition as a hard,
--   structurally-enforced actions-module action, the same tier as a Stripe
--   charge: "or transition a prize_receivables row to received." So
--   approvals.action_type gains 'receivable_received' here (additive: drop
--   and re-add the check constraint, the same pattern the step 0.2 comments
--   already documented for extending this list). expense_save and
--   balance_update were already provisioned in that step 0.2 constraint;
--   wiring a real gated caller for expense_save is step 2.2's Financial
--   Agent (receipt scanning), not this step.
-- * ledger_lines stores no home-currency amount at all (M-DATA-1): display
--   conversion is a pure function (packages/db/src/ledger.ts) applied at
--   read time against fx_rates_daily, never a stored column. tournament_id
--   is a plain uuid with no foreign key yet: the tournaments table doesn't
--   exist until step 3.1, and this project's migrations are additive-only,
--   so the FK is added then rather than reordering build-plan steps.
-- * prize_receivables has no insert or update policy for authenticated:
--   PRD-03 F-9 says a receivable "is created from results," i.e. by the
--   Tournament Agent once results ingestion exists (step 3.2); until then
--   rows come from the service role (test fixtures, later that agent). A
--   player can still read their own (select_own), and the one transition
--   available this step, marking one received, always goes through
--   packages/actions' runGatedAction, which itself runs on the service
--   role and so bypasses RLS by design, not by an extra grant here. A check
--   constraint ties status='received' to having all three realised_* /
--   received_at fields set and vice versa, so "only a received transition
--   writes the realised figures" (PRD-03 section 3) is a DB invariant, not
--   just an application convention.
-- * reserve_entries is the opposite: PRD-03 F-2/F-3 says balances are
--   "typed by the player," a direct, no-vendor-call write, so it gets a
--   normal player insert policy like ledger_lines rather than going
--   through the actions module (the hard list in TECH-ARCHITECTURE.md
--   section 3 is Stripe/Resend/ICS plus the two named transitions; a
--   reserve_entries insert is neither). The insert policy's with-check
--   restricts a player-authored row to cause='player': cause='received_prize'
--   is only ever written by the service-role side effect behind the
--   receivable-received gate above, so a player can't forge a "prize
--   received" reserve entry by inserting one directly.

alter table public.approvals drop constraint approvals_action_type_check;
alter table public.approvals add constraint approvals_action_type_check check (
  action_type in (
    'entry_confirm', 'expense_save', 'balance_update', 'patron_send',
    'content_publish', 'sponsor_send', 'retract', 'tier_change',
    'receivable_received'
  )
);

-- ---------------------------------------------------------------------------
-- ledger_lines: every expense, manual, scanned or planned (PRD-03 section 6).
-- ---------------------------------------------------------------------------
create table public.ledger_lines (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  tournament_id uuid,
  date date not null,
  category text not null check (
    category in (
      'travel', 'accommodation', 'coaching', 'equipment', 'food', 'physio',
      'entry_fees', 'other'
    )
  ),
  what text not null,
  amount_original numeric not null check (amount_original > 0),
  currency_original char(3) not null,
  fx_rate_date date not null,
  source text not null check (source in ('manual', 'scanned', 'planned')),
  receipt_ref text,
  unsure_fields jsonb not null default '[]'::jsonb,
  edits jsonb not null default '[]'::jsonb,
  fresh boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.ledger_lines is
  'Every expense line (M-DATA-1). No home-currency amount is stored; display conversion is always a read-time lookup against fx_rates_daily as of fx_rate_date, which is what makes a later home-currency preference change safe (PRD-00 M-DATA-1, M-CUR-1).';

create index ledger_lines_player_date_idx on public.ledger_lines (player_id, date);
create index ledger_lines_tournament_idx on public.ledger_lines (tournament_id);

alter table public.ledger_lines enable row level security;

create policy ledger_lines_select_own on public.ledger_lines
  for select
  to authenticated
  using (player_id = auth.uid());

create policy ledger_lines_insert_own on public.ledger_lines
  for insert
  to authenticated
  with check (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- prize_receivables: prize money, pending in its paying currency until the
-- player marks it received (M-DATA-2, PRD-03 F-9).
-- ---------------------------------------------------------------------------
create table public.prize_receivables (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  tournament_id uuid,
  event text not null check (event in ('singles', 'doubles')),
  round text not null,
  gross_amount numeric not null check (gross_amount > 0),
  player_share numeric not null default 1.0 check (player_share > 0 and player_share <= 1),
  currency char(3) not null,
  withholding_amount numeric not null default 0 check (withholding_amount >= 0),
  expected_date date not null,
  status text not null default 'pending' check (status in ('pending', 'received', 'no_prize')),
  received_at timestamptz,
  realised_rate numeric,
  realised_home_currency char(3),
  created_at timestamptz not null default now(),
  constraint prize_receivables_realised_fields_match_status check (
    (status = 'received') = (
      received_at is not null and realised_rate is not null and realised_home_currency is not null
    )
  )
);

comment on table public.prize_receivables is
  'Prize money owed to the player. Stays pending in its paying currency until marked received; only that transition (packages/actions, action_type receivable_received) writes realised_rate/realised_home_currency and only then does it count toward reserves (M-DATA-2). A doubles result''s row is the player''s share only (player_share, default 0.5), per PRD-00 M-STG-4.';

create index prize_receivables_player_status_expected_idx
  on public.prize_receivables (player_id, status, expected_date);

alter table public.prize_receivables enable row level security;

create policy prize_receivables_select_own on public.prize_receivables
  for select
  to authenticated
  using (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- reserve_entries: player-typed cash balances (PRD-03 F-2/F-3). No bank
-- connection; each row is the new total balance the player entered, or the
-- balance after a receivable was marked received.
-- ---------------------------------------------------------------------------
create table public.reserve_entries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  amount numeric not null check (amount >= 0),
  currency char(3) not null,
  entered_at timestamptz not null default now(),
  previous_amount numeric,
  cause text not null check (cause in ('player', 'received_prize')),
  device text
);

comment on table public.reserve_entries is
  'Player-typed cash balances only, no bank connection (PRD-03 F-2). Each row holds the new absolute balance and the previous one, so an update is fully audited (M-GATE-4). cause=received_prize rows are written only by the receivable-received gated action, never inserted directly by a player (see the insert policy''s with check).';

create index reserve_entries_player_entered_idx on public.reserve_entries (player_id, entered_at);

alter table public.reserve_entries enable row level security;

create policy reserve_entries_select_own on public.reserve_entries
  for select
  to authenticated
  using (player_id = auth.uid());

create policy reserve_entries_insert_own on public.reserve_entries
  for insert
  to authenticated
  with check (player_id = auth.uid() and cause = 'player');
