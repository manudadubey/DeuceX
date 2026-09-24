-- Step 4.1: Fans (the patron programme).
-- Source: PRD-04 (all), decisions worksheet 5 and 6 (8 percent Pro, 5 percent
-- Elite, taken on the gross; Stripe's charge stored separately), PRD-00
-- M-TIER-3 (the 51st patron on Pro sees a waitlist, never an error), and
-- TECH-ARCHITECTURE.md 2.2's own `patrons` and `payouts` rows.
--
-- Design notes (see docs/BUILD-LOG.md's step 4.1 entry for the full write-up):
-- * Direct charges on the player's Stripe Connect Express account (owner
--   decision, this session): Checkout runs on the connected account with
--   application_fee_percent 8 or 5, so the player's account pays Stripe's own
--   charge and PRD-04 section 7's arithmetic (A$612 -> A$49 fee, A$14 Stripe,
--   A$549 net) is exactly what Stripe's balance transactions report, not an
--   estimate.
-- * patron_programmes is the one row per player holding the Connect account
--   state (KYC, bank last four) and the public /p/<slug> page's slug. The
--   player can write exactly one column of it directly (names_line_enabled,
--   P-19's "Patron names" switch); everything else is written by apps/api's
--   service role from Stripe's own account state, the same "system writes,
--   player reads" shape step 3.2's shortlist_candidates uses.
-- * patron_tiers are grandfathered (owner decision, this session): a price
--   change mints a new Stripe price and only new sign-ups pay it, so
--   patrons.price/currency record what each patron actually pays, never
--   re-derived from the tier's current price.
-- * patrons, patron_events, payouts, patron_waitlist, patron_notes_sent and
--   patron_note_drafts are all service-role written (webhooks, the attention
--   pass, gated actions) and player-read only.
-- * stripe_webhook_events is the idempotency and audit log for every webhook
--   applied (PRD-04 section 3's Audit paragraph). RLS on, no policy at all:
--   only the service role reads or writes it.
-- * payouts follows TECH-ARCHITECTURE.md 2.2 exactly, including
--   net = gross - platform_fee - stripe_fee as a check constraint and a paid
--   row being immutable (M-GATE-3).
-- * Two additive approvals.action_type values: connect_onboard (starting or
--   resuming Stripe Connect onboarding sends the player's details to Stripe)
--   and waitlist_invite (owner decision, this session: the player confirms
--   each invitation, one approval per email). patron_send and tier_change
--   already existed, reserved since step 0.2.

-- ---------------------------------------------------------------------------
-- patron_programmes
-- ---------------------------------------------------------------------------
create table public.patron_programmes (
  player_id uuid primary key references public.players (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  stripe_account_id text unique,
  kyc_status text not null default 'not_started'
    check (kyc_status in ('not_started', 'pending', 'complete', 'action_required')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  bank_last4 text check (bank_last4 is null or bank_last4 ~ '^[0-9]{4}$'),
  names_line_enabled boolean not null default false,
  stripe_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patron_programmes is
  'PRD-04 sections 3 and 4.1. One row per player with a patron programme: the Stripe Connect Express account state (KYC, bank last four only, P-12) and the public page slug. stripe_synced_at drives the "Stripe · not refreshed since <time>" failure state.';
comment on column public.patron_programmes.names_line_enabled is
  'P-19 / P-AC-14: the "Patron names" switch. The only column a player writes directly.';

alter table public.patron_programmes enable row level security;

create policy patron_programmes_select_own on public.patron_programmes
  for select
  to authenticated
  using (player_id = auth.uid());

create policy patron_programmes_update_own on public.patron_programmes
  for update
  to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

revoke insert, update, delete on public.patron_programmes from authenticated, anon;
grant update (names_line_enabled) on public.patron_programmes to authenticated;

create trigger patron_programmes_set_updated_at
  before update on public.patron_programmes
  for each row execute function public.set_notes_updated_at();

-- ---------------------------------------------------------------------------
-- patron_tiers
-- ---------------------------------------------------------------------------
create table public.patron_tiers (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  name text not null check (length(name) between 1 and 40),
  price numeric(12, 2) not null check (price > 0),
  currency char(3) not null,
  perks text not null default '',
  stripe_product_id text,
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patron_tiers_player_position_uq unique (player_id, position)
);

comment on table public.patron_tiers is
  'PRD-04 P-1. Three tiers per player, priced in the home currency (M-CUR-1). Grandfathered: stripe_price_id is the price new sign-ups pay; existing patrons keep the price recorded on their own patrons row.';

alter table public.patron_tiers enable row level security;

create policy patron_tiers_select_own on public.patron_tiers
  for select
  to authenticated
  using (player_id = auth.uid());

create trigger patron_tiers_set_updated_at
  before update on public.patron_tiers
  for each row execute function public.set_notes_updated_at();

-- ---------------------------------------------------------------------------
-- patrons
-- ---------------------------------------------------------------------------
create table public.patrons (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  tier_id uuid not null references public.patron_tiers (id),
  stripe_customer_id text,
  stripe_subscription_id text not null unique,
  name text not null,
  email text,
  city text,
  country text,
  source text not null default 'unknown' check (source in ('profile', 'draw', 'direct', 'unknown')),
  status text not null default 'active' check (status in ('active', 'past_due', 'paused', 'left')),
  since timestamptz not null default now(),
  left_at timestamptz,
  left_reason text,
  price numeric(12, 2) not null check (price > 0),
  currency char(3) not null,
  opens jsonb not null default '[]'::jsonb,
  flag text not null default 'none' check (flag in ('quiet', 'card', 'new', 'none')),
  note text,
  names_opt_in boolean not null default false,
  card_failed_at timestamptz,
  card_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patrons is
  'PRD-04 section 6. One row per Stripe subscription on the player''s connected account. status left keeps the record (P-AC-7). price/currency are what this patron actually pays (grandfathered). opens is the last six delivered updates, 1/0/null (P-5), filled by the Content Agent''s Resend events from step 4.2.';

create index patrons_player_idx on public.patrons (player_id, status);

alter table public.patrons enable row level security;

create policy patrons_select_own on public.patrons
  for select
  to authenticated
  using (player_id = auth.uid());

create trigger patrons_set_updated_at
  before update on public.patrons
  for each row execute function public.set_notes_updated_at();

-- ---------------------------------------------------------------------------
-- patron_events: the Last 30 days feed (P-6).
-- ---------------------------------------------------------------------------
create table public.patron_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  patron_id uuid not null references public.patrons (id) on delete cascade,
  kind text not null check (kind in ('join', 'upgrade', 'downgrade', 'leave', 'card_failed', 'card_recovered')),
  at timestamptz not null,
  attribution text not null default '',
  from_tier_id uuid references public.patron_tiers (id),
  to_tier_id uuid references public.patron_tiers (id),
  stripe_event_id text,
  created_at timestamptz not null default now()
);

comment on table public.patron_events is
  'PRD-04 P-6. One row per patron change with its attribution sentence. A join is recorded once per patron (partial unique index), whichever of the webhook or the checkout-return reconcile arrives first.';

create index patron_events_player_at_idx on public.patron_events (player_id, at);
create unique index patron_events_one_join_uq on public.patron_events (patron_id) where kind = 'join';
create unique index patron_events_stripe_event_uq on public.patron_events (stripe_event_id, kind)
  where stripe_event_id is not null;

alter table public.patron_events enable row level security;

create policy patron_events_select_own on public.patron_events
  for select
  to authenticated
  using (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- payouts: TECH-ARCHITECTURE.md 2.2's own field list.
-- ---------------------------------------------------------------------------
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  stripe_payout_id text not null unique,
  friday date not null,
  gross numeric(12, 2) not null check (gross >= 0),
  platform_fee numeric(12, 2) not null check (platform_fee >= 0),
  platform_fee_rate numeric(4, 3) not null check (platform_fee_rate in (0.08, 0.05)),
  stripe_fee numeric(12, 2) not null check (stripe_fee >= 0),
  net numeric(12, 2) not null,
  currency char(3) not null,
  status text not null check (status in ('scheduled', 'paid', 'held', 'failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payouts_net_check check (net = gross - platform_fee - stripe_fee)
);

comment on table public.payouts is
  'PRD-04 P-12, P-13. The platform fee is taken on the gross and Stripe''s charge is stored separately (worksheet 5 and 6). platform_fee_rate is frozen at payout time. A paid row is immutable (M-GATE-3).';

create index payouts_player_friday_idx on public.payouts (player_id, friday);

alter table public.payouts enable row level security;

create policy payouts_select_own on public.payouts
  for select
  to authenticated
  using (player_id = auth.uid());

create function public.reject_paid_payout_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'paid' then
    raise exception 'payouts: a paid payout (%) cannot be changed or removed', old.stripe_payout_id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger payouts_paid_immutable
  before update or delete on public.payouts
  for each row execute function public.reject_paid_payout_mutation();

-- ---------------------------------------------------------------------------
-- patron_waitlist (P-3, P-4, M-TIER-3)
-- ---------------------------------------------------------------------------
create table public.patron_waitlist (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  joined_at timestamptz not null default now(),
  invited_at timestamptz,
  converted_at timestamptz
);

comment on table public.patron_waitlist is
  'PRD-04 P-3/P-4. Written by the public page (service role) when a Pro page is full. invited_at is set only by the gated waitlist_invite action, one player approval per invitation (owner decision, step 4.1).';

create unique index patron_waitlist_player_email_uq on public.patron_waitlist (player_id, lower(email));
create index patron_waitlist_player_joined_idx on public.patron_waitlist (player_id, joined_at);

alter table public.patron_waitlist enable row level security;

create policy patron_waitlist_select_own on public.patron_waitlist
  for select
  to authenticated
  using (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- patron_note_drafts / patron_notes_sent (P-10, P-11)
-- ---------------------------------------------------------------------------
create table public.patron_note_drafts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  patron_id uuid not null references public.patrons (id) on delete cascade,
  kind text not null check (kind in ('thanks', 'nudge', 'checkin', 'welcome')),
  text text not null,
  agent_run_inputs_hash text not null,
  created_at timestamptz not null default now(),
  constraint patron_note_drafts_patron_kind_uq unique (patron_id, kind)
);

comment on table public.patron_note_drafts is
  'PRD-04 section 3 Cost: a drafted note is generated on tap, never in bulk, and cached here so re-opening the composer does not pay for a second call.';

alter table public.patron_note_drafts enable row level security;

create policy patron_note_drafts_select_own on public.patron_note_drafts
  for select
  to authenticated
  using (player_id = auth.uid());

create table public.patron_notes_sent (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  patron_id uuid not null references public.patrons (id) on delete cascade,
  approval_id uuid not null references public.approvals (id),
  kind text not null check (kind in ('thanks', 'nudge', 'checkin', 'welcome')),
  text text not null,
  draft_text text,
  sent_at timestamptz not null default now(),
  device text
);

comment on table public.patron_notes_sent is
  'PRD-04 section 3 Audit: every sent note with recipient, text as sent, timestamp and device. draft_text keeps what the agent proposed so note_sent''s editedChars is computable.';

create index patron_notes_sent_player_idx on public.patron_notes_sent (player_id, sent_at);

alter table public.patron_notes_sent enable row level security;

create policy patron_notes_sent_select_own on public.patron_notes_sent
  for select
  to authenticated
  using (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- stripe_webhook_events: idempotency and audit, service role only.
-- ---------------------------------------------------------------------------
create table public.stripe_webhook_events (
  id text primary key,
  type text not null,
  account text,
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  error text
);

comment on table public.stripe_webhook_events is
  'PRD-04 section 3 Audit: every Stripe webhook applied. id is Stripe''s own event id, which is what makes re-delivery a no-op. No RLS policy: service role only.';

alter table public.stripe_webhook_events enable row level security;

-- ---------------------------------------------------------------------------
-- approvals.action_type: two additive values (see design notes above).
-- ---------------------------------------------------------------------------
alter table public.approvals drop constraint approvals_action_type_check;
alter table public.approvals add constraint approvals_action_type_check check (
  action_type in (
    'entry_confirm', 'expense_save', 'balance_update', 'patron_send',
    'content_publish', 'sponsor_send', 'retract', 'tier_change',
    'receivable_received', 'account_deletion_request', 'data_export_request',
    'connect_onboard', 'waitlist_invite'
  )
);
