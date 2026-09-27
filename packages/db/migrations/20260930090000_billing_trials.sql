-- Billing, session 1: trials and Checkout (docs/BILLING-DECISIONS.md, owner
-- decisions of 27 September 2026).
--
-- * players.tier, tier_status and billing_cycle stop being player-writable.
--   Until now any signed-in player could set their own row to Elite through
--   the step 2.3 update grant (and the table-wide insert grant from step
--   1.4). From here the plan moves only through the two functions below
--   (trial start, a downgrade with nothing to cancel), through apps/api
--   (Stripe Checkout, cancelling a paid plan, the hourly lapse sweep), or
--   through staff (comps, trial extensions).
-- * Insert on players is narrowed to the columns onboarding writes, so a
--   first insert can't set a plan either. tier and tier_status now default
--   to 'free'.
-- * Trials are held in DeuceX (decision 1A): trial_started_at makes them
--   once per player, trial_plan records which plan, trial_reminded_at makes
--   the day-12 reminder send once. trial_ends_at already exists (step 5.1).
-- * billing_subscriptions: one row per player with a Stripe subscription
--   (platform account, not Connect). Written only by apps/api.
-- * billing_events: an append-only record of what happened to a player's
--   plan and why, including the automatic patron-billing pause at a trial
--   lapse (owner decision, 27 September 2026, extending the failed-payment
--   rule to a lapsed trial). Readable by the player.
-- * approvals.action_type gains subscription_checkout (opening Stripe
--   Checkout for a plan) and subscription_cancel (ending a paid plan).
-- * Existing players marked 'trialing' with no end date get a fresh 14-day
--   trial from today (decision 5).

-- players: trial bookkeeping and the Stripe customer.
alter table public.players
  add column trial_started_at timestamptz,
  add column trial_plan text check (trial_plan in ('pro', 'elite')),
  add column trial_reminded_at timestamptz,
  add column stripe_customer_id text unique;

alter table public.players alter column tier set default 'free';
alter table public.players alter column tier_status set default 'free';

-- The step 4.3 update grant, less tier, tier_status and billing_cycle.
revoke update on public.players from authenticated;
grant update (
  id, tour, name, email, country, dob, guardian_email, guardian_confirmed_at,
  verification, verification_source, home_currency, patron_language, app_language,
  units, timezone, stage, stage_pinned,
  handed, tour_player_id, itf_id, tour_rank, tour_points, itf_rank, wtn,
  target_rank, key_tournaments, surfaces, weekly_budget, blocked_dates,
  dashboard_state, onboarding_started_at, onboarding_finished_at,
  spoken_language, date_format, quiet_hours_start, quiet_hours_end,
  notification_prefs, emergency_contact, reserve_reminder_enabled,
  home_airport, coach_weekly_fee, coach_travels,
  content_window, content_private_names, profile_teaser,
  daily_food_allowance, next_match_at, next_match_label
) on public.players to authenticated;

-- Exactly the columns finishOnboarding upserts (packages/db/src/players.ts).
revoke insert on public.players from authenticated;
grant insert (
  id, name, email, country, dob, handed, tour, tour_player_id, itf_id,
  verification, verification_source, tour_rank, tour_points, itf_rank, wtn,
  stage, stage_pinned, target_rank, key_tournaments, surfaces, weekly_budget,
  blocked_dates, guardian_email, home_currency, app_language, units, timezone,
  patron_language, dashboard_state, onboarding_started_at, onboarding_finished_at
) on public.players to authenticated;

-- billing_subscriptions ------------------------------------------------------

create table public.billing_subscriptions (
  player_id uuid primary key references public.players (id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  plan text not null check (plan in ('pro', 'elite')),
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual')),
  -- Stripe's own subscription status, as last seen.
  status text not null,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.billing_subscriptions is
  'A player''s DeuceX plan subscription on Stripe (platform account). Written only by apps/api.';

alter table public.billing_subscriptions enable row level security;

create policy billing_subscriptions_select_own on public.billing_subscriptions
  for select
  to authenticated
  using (player_id = auth.uid());

revoke insert, update, delete on public.billing_subscriptions from authenticated, anon;

-- billing_events -------------------------------------------------------------

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null check (kind in (
    'trial_started', 'trial_reminder', 'trial_lapsed', 'patron_billing_auto_paused',
    'checkout_completed', 'subscription_active', 'subscription_cancel_requested',
    'downgraded'
  )),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.billing_events is
  'Append-only record of changes to a player''s plan and the reason for each.';

create index billing_events_player_created_idx on public.billing_events (player_id, created_at);

alter table public.billing_events enable row level security;

create policy billing_events_select_own on public.billing_events
  for select
  to authenticated
  using (player_id = auth.uid());

revoke insert, update, delete on public.billing_events from authenticated, anon;

-- start_trial: the one way a player starts a trial. Once per player, only
-- from Free (a comped or paying player can't), 14 days from now.
create function public.start_trial(p_plan text, p_cycle text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid := auth.uid();
  v_ends timestamptz := now() + interval '14 days';
begin
  if v_player is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_plan not in ('pro', 'elite') then
    raise exception 'plan must be pro or elite' using errcode = '22023';
  end if;
  if p_cycle not in ('monthly', 'annual') then
    raise exception 'billing cycle must be monthly or annual' using errcode = '22023';
  end if;

  update public.players
     set tier = p_plan,
         tier_status = 'trialing',
         billing_cycle = p_cycle,
         trial_plan = p_plan,
         trial_started_at = now(),
         trial_ends_at = v_ends,
         trial_reminded_at = null
   where id = v_player
     and trial_started_at is null
     and coalesce(tier_status, 'free') = 'free';
  if not found then
    raise exception 'trial_unavailable' using errcode = 'P0001';
  end if;

  insert into public.billing_events (player_id, kind, detail)
  values (v_player, 'trial_started',
          jsonb_build_object('plan', p_plan, 'cycle', p_cycle, 'ends_at', v_ends));
  return v_ends;
end;
$$;

revoke all on function public.start_trial(text, text) from public, anon;
grant execute on function public.start_trial(text, text) to authenticated;

-- downgrade_to_free: only when there's nothing on Stripe to end (a trial
-- with no card yet). A paid or card-backed plan ends through apps/api's
-- gated subscription_cancel instead; staff comps end through the console.
create function public.downgrade_to_free()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid := auth.uid();
begin
  if v_player is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.billing_subscriptions
     where player_id = v_player and status not in ('canceled', 'incomplete_expired')
  ) then
    raise exception 'subscription_active' using errcode = 'P0001';
  end if;

  update public.players
     set tier = 'free', tier_status = 'free'
   where id = v_player
     and coalesce(tier_status, 'free') <> 'comped';
  if not found then
    raise exception 'downgrade_unavailable' using errcode = 'P0001';
  end if;

  insert into public.billing_events (player_id, kind, detail)
  values (v_player, 'downgraded', jsonb_build_object('immediate', true));
end;
$$;

revoke all on function public.downgrade_to_free() from public, anon;
grant execute on function public.downgrade_to_free() to authenticated;

-- approvals ------------------------------------------------------------------

alter table public.approvals drop constraint approvals_action_type_check;
alter table public.approvals add constraint approvals_action_type_check check (
  action_type in (
    'entry_confirm', 'expense_save', 'balance_update', 'patron_send',
    'content_publish', 'sponsor_send', 'retract', 'tier_change',
    'receivable_received', 'account_deletion_request', 'data_export_request',
    'connect_onboard', 'waitlist_invite',
    'patron_billing_pause', 'patron_billing_resume',
    'subscription_checkout', 'subscription_cancel'
  )
);

-- Backfill (decision 5): open-ended trials restart today for 14 days.
update public.players
   set trial_started_at = now(),
       trial_ends_at = now() + interval '14 days',
       trial_plan = case when tier in ('pro', 'elite') then tier else 'pro' end
 where tier_status = 'trialing'
   and trial_ends_at is null;
