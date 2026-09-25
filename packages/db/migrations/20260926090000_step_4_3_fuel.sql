-- Step 4.3: Fuel (menu scanning).
-- Source: PRD-07 (all), decisions worksheet 15 (gate Fuel plainly on Free),
-- PRD-00 M-PRIV-1, M-DATA-1, M-CUR-1, M-GATE-1..3.
--
-- Design notes (see docs/BUILD-LOG.md's step 4.3 entry for the full write-up):
-- * Four owner decisions made this session: the daily food allowance is a
--   player-set amount in the home currency (players.daily_food_allowance, set
--   from the Financial Agent's budget card); the dietary profile is edited
--   only from Fuel's Preferences control (no onboarding step); the next match
--   is player-set on the Fuel page (players.next_match_at/next_match_label),
--   since nothing in this codebase records a match time yet; and a meal's
--   outcome is inferred from the next day's mood as PRD-07 FU-15 specifies.
-- * fuel_profiles holds exclusions and allergies as closed vocabularies so
--   the hard filters (FU-7) are enforced by code against the extractor's own
--   closed "contains" tags, never by matching free text or trusting the
--   model to apply a rule. Preferences stay free text: they only re-rank.
--   A separate table rather than players columns because allergies are
--   health-adjacent: the console role reads players (TECH-ARCHITECTURE 2.4)
--   and gets no grant here.
-- * menu_scans is one row per completed or failed scan, service-role written
--   and player-read (the "system writes, player reads" shape of step 4.1 and
--   4.2). Photos are never stored anywhere (the step 2.2 receipt precedent):
--   they are held in apps/api memory for one extraction call, so
--   photos_deleted_at is the moment those buffers were released, recorded on
--   every row whatever the status (FU-13, FU-AC-10). Only hashes are kept.
-- * meal_logs is the "I'm having this" record. Logging and un-logging go
--   through two SECURITY DEFINER functions rather than direct inserts: each
--   writes or removes the Food ledger line and the meal row together, reads
--   the dish and price from the server's own menu_scans row (never from the
--   client, the same discipline as step 3.2's confirmEntry), and un-log is
--   refused after local midnight (M-GATE-3). No approval row: an expense
--   line is plain player CRUD (step 2.2), and Fuel has no vendor side effect.
-- * ledger_lines.source gains 'fuel' (PRD-07 section 4.2: "an expense line
--   with source Fuel"). The line stores the menu amount and currency with
--   fx_rate_date set to the scan's own rate date: the rate the player was
--   shown is the rate the line converts at (M-DATA-1, FU-12).
-- * The outcome (Worked / Flat next day) is player-written through a column
--   grant; the hourly inference sweep in apps/api writes the inferred value
--   with the service role.

-- ---------------------------------------------------------------------------
-- players: food allowance and the player-set next match
-- ---------------------------------------------------------------------------
alter table public.players
  add column daily_food_allowance numeric check (daily_food_allowance is null or daily_food_allowance > 0),
  add column next_match_at timestamptz,
  add column next_match_label text check (next_match_label is null or char_length(next_match_label) <= 80);

comment on column public.players.daily_food_allowance is
  'PRD-07 section 7 "food money left today": the player''s own daily food amount in home_currency, set on the Financial Agent page (owner decision, step 4.3). Fuel shows it less today''s Food lines and never edits it.';
comment on column public.players.next_match_at is
  'PRD-07 section 7 week mode: the player-set start of their next match (owner decision, step 4.3; no order-of-play feed exists). Overwritten each time; a past value reads as not set.';
comment on column public.players.next_match_label is
  'Free text shown on the Fuel match chip, e.g. "Q1 vs Petrov".';

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
  home_airport, coach_weekly_fee, coach_travels,
  content_window, content_private_names, profile_teaser,
  daily_food_allowance, next_match_at, next_match_label
) on public.players to authenticated;

-- ---------------------------------------------------------------------------
-- ledger_lines.source: add 'fuel'
-- ---------------------------------------------------------------------------
alter table public.ledger_lines drop constraint ledger_lines_source_check;
alter table public.ledger_lines add constraint ledger_lines_source_check check (
  source in ('manual', 'scanned', 'planned', 'fuel')
);

-- ---------------------------------------------------------------------------
-- fuel_profiles: the dietary profile (PRD-07 section 6)
-- ---------------------------------------------------------------------------
create table public.fuel_profiles (
  player_id uuid primary key references public.players (id) on delete cascade,
  exclusions text[] not null default '{}' check (
    exclusions <@ array['pork', 'beef', 'lamb', 'meat', 'fish', 'shellfish', 'alcohol']::text[]
  ),
  allergies text[] not null default '{}' check (
    allergies <@ array[
      'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk', 'tree_nuts',
      'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'
    ]::text[]
  ),
  preferences text[] not null default '{}' check (cardinality(preferences) <= 10),
  updated_at timestamptz not null default now()
);

comment on table public.fuel_profiles is
  'PRD-07 dietary profile. exclusions and allergies are closed vocabularies (allergies are the EU 14) so FU-7''s hard filter is a set intersection in code against the extractor''s closed contains tags. preferences are free-text words that only re-rank. No console grant.';

alter table public.fuel_profiles enable row level security;

create policy fuel_profiles_select_own on public.fuel_profiles
  for select to authenticated using (player_id = auth.uid());
create policy fuel_profiles_insert_own on public.fuel_profiles
  for insert to authenticated with check (player_id = auth.uid());
create policy fuel_profiles_update_own on public.fuel_profiles
  for update to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());

revoke update on public.fuel_profiles from authenticated;
grant update (exclusions, allergies, preferences, updated_at) on public.fuel_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- menu_scans (PRD-07 section 6, "Menu scan")
-- ---------------------------------------------------------------------------
create table public.menu_scans (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  captured_at timestamptz not null default now(),
  local_date date not null,
  city text,
  country text,
  tournament_id uuid references public.tournaments (id),
  venue_name text,
  venue_type text check (venue_type in ('restaurant', 'room-service', 'shop', 'other')),
  pages integer not null check (pages > 0),
  photo_hashes text[] not null,
  languages text[] not null default '{}',
  dishes_read integer check (dishes_read is null or dishes_read >= 0),
  menu_currency char(3),
  home_currency char(3) not null,
  rate numeric,
  rate_date date,
  mode text not null check (mode in ('pre-match', 'post-match', 'travel', 'rest', 'practice')),
  context_snapshot jsonb not null default '{}'::jsonb,
  picks jsonb not null default '[]'::jsonb,
  avoid jsonb not null default '[]'::jsonb,
  second_visit text,
  status text not null check (status in ('ready', 'unreadable', 'failed')),
  photos_deleted_at timestamptz not null,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint menu_scans_hashes_match_pages check (cardinality(photo_hashes) = pages)
);

comment on table public.menu_scans is
  'One row per Fuel scan (PRD-07). Service-role written by apps/api, player-read. Photos are never stored: photo_hashes and photos_deleted_at (the moment the in-memory buffers were released) are the whole photo record (M-PRIV-1, FU-13). rate is menu_currency to home_currency on rate_date, kept for audit; display still converts at read time.';

create index menu_scans_player_captured_idx on public.menu_scans (player_id, captured_at desc);

alter table public.menu_scans enable row level security;

create policy menu_scans_select_own on public.menu_scans
  for select to authenticated using (player_id = auth.uid());

revoke insert, update, delete on public.menu_scans from authenticated, anon;

-- ---------------------------------------------------------------------------
-- meal_logs (PRD-07 section 6, "Meal log")
-- ---------------------------------------------------------------------------
create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  scan_id uuid not null references public.menu_scans (id) on delete cascade,
  pick_rank integer not null check (pick_rank between 1 and 3),
  logged_at timestamptz not null default now(),
  local_date date not null,
  city text,
  country text,
  venue_name text,
  dish_original text not null,
  dish_english text not null,
  mode text not null check (mode in ('pre-match', 'post-match', 'travel', 'rest', 'practice')),
  price_menu numeric not null check (price_menu > 0),
  currency_menu char(3) not null,
  rate numeric,
  rate_date date not null,
  expense_line_id uuid references public.ledger_lines (id) on delete set null,
  tournament_id uuid references public.tournaments (id),
  outcome text not null default 'none' check (outcome in ('none', 'worked', 'flat')),
  outcome_source text check (outcome_source in ('tap-history', 'tap-checkin', 'inferred-mood')),
  outcome_at timestamptz,
  device text,
  created_at timestamptz not null default now(),
  constraint meal_logs_one_per_scan unique (scan_id),
  constraint meal_logs_outcome_source_matches check ((outcome = 'none') = (outcome_source is null))
);

comment on table public.meal_logs is
  'PRD-07 "I''m having this". Written and removed only by log_fuel_pick/unlog_fuel_meal, which pair it with its Food ledger line. One logged pick per scan. outcome is player-set by tap or inferred from the next day''s mood by apps/api''s sweep (FU-15).';

create index meal_logs_player_date_idx on public.meal_logs (player_id, local_date desc);

alter table public.meal_logs enable row level security;

create policy meal_logs_select_own on public.meal_logs
  for select to authenticated using (player_id = auth.uid());
create policy meal_logs_update_own on public.meal_logs
  for update to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());

revoke insert, update, delete on public.meal_logs from authenticated, anon;
grant update (outcome, outcome_source, outcome_at) on public.meal_logs to authenticated;

-- ---------------------------------------------------------------------------
-- log_fuel_pick / unlog_fuel_meal
-- ---------------------------------------------------------------------------
create function public.log_fuel_pick(p_scan_id uuid, p_rank integer, p_device text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := auth.uid();
  v_scan public.menu_scans%rowtype;
  v_pick jsonb;
  v_tz text;
  v_local_ts timestamp;
  v_local_date date;
  v_meal text;
  v_venue text;
  v_line_id uuid;
  v_meal_id uuid;
  v_price numeric;
begin
  if v_player is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_scan from public.menu_scans where id = p_scan_id and player_id = v_player;
  if not found then
    raise exception 'scan not found' using errcode = 'P0002';
  end if;
  if v_scan.status <> 'ready' or v_scan.menu_currency is null then
    raise exception 'scan has no picks' using errcode = '22023';
  end if;

  select p into v_pick from jsonb_array_elements(v_scan.picks) p where (p ->> 'rank')::int = p_rank;
  if v_pick is null then
    raise exception 'no pick with that rank' using errcode = '22023';
  end if;
  v_price := (v_pick ->> 'priceMenu')::numeric;
  if v_price is null or v_price <= 0 then
    raise exception 'pick has no menu price' using errcode = '22023';
  end if;

  select timezone into v_tz from public.players where id = v_player;
  v_local_ts := now() at time zone coalesce(v_tz, 'UTC');
  v_local_date := v_local_ts::date;
  v_meal := case
    when extract(hour from v_local_ts) < 11 then 'Breakfast'
    when extract(hour from v_local_ts) < 16 then 'Lunch'
    else 'Dinner'
  end;
  v_venue := coalesce(v_scan.venue_name, 'menu scan');

  insert into public.ledger_lines (
    player_id, date, category, what, amount_original, currency_original,
    fx_rate_date, source, real_tournament_id
  ) values (
    v_player, v_local_date, 'food',
    v_meal || ' · ' || (v_pick ->> 'dishEnglish') || ' · ' || v_venue,
    v_price, v_scan.menu_currency,
    coalesce(v_scan.rate_date, v_local_date), 'fuel', v_scan.tournament_id
  ) returning id into v_line_id;

  insert into public.meal_logs (
    player_id, scan_id, pick_rank, local_date, city, country, venue_name,
    dish_original, dish_english, mode, price_menu, currency_menu, rate, rate_date,
    expense_line_id, tournament_id, device
  ) values (
    v_player, v_scan.id, p_rank, v_local_date, v_scan.city, v_scan.country, v_scan.venue_name,
    v_pick ->> 'dishOriginal', v_pick ->> 'dishEnglish', v_scan.mode, v_price,
    v_scan.menu_currency, v_scan.rate, coalesce(v_scan.rate_date, v_local_date),
    v_line_id, v_scan.tournament_id, left(p_device, 200)
  ) returning id into v_meal_id;

  return jsonb_build_object('mealId', v_meal_id, 'expenseLineId', v_line_id);
end;
$$;

comment on function public.log_fuel_pick(uuid, integer, text) is
  'PRD-07 FU-12: logs one pick from the caller''s own ready scan as a meal plus one Food ledger line in the menu currency at the scan''s rate date. Dish and price come from the stored scan, never the client. A second log for the same scan fails on meal_logs_one_per_scan.';

create function public.unlog_fuel_meal(p_meal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := auth.uid();
  v_meal public.meal_logs%rowtype;
  v_tz text;
begin
  if v_player is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_meal from public.meal_logs where id = p_meal_id and player_id = v_player;
  if not found then
    raise exception 'meal not found' using errcode = 'P0002';
  end if;

  select timezone into v_tz from public.players where id = v_player;
  if (now() at time zone coalesce(v_tz, 'UTC'))::date <> v_meal.local_date then
    raise exception 'a logged meal can only be undone until midnight' using errcode = '22023';
  end if;

  delete from public.meal_logs where id = v_meal.id;
  if v_meal.expense_line_id is not null then
    delete from public.ledger_lines
      where id = v_meal.expense_line_id and player_id = v_player and source = 'fuel';
  end if;
end;
$$;

comment on function public.unlog_fuel_meal(uuid) is
  'PRD-07 FU-12/FU-AC-8, M-GATE-3: removes the caller''s own logged meal and its Fuel ledger line, only on the same local day it was logged.';

revoke all on function public.log_fuel_pick(uuid, integer, text) from public;
revoke all on function public.unlog_fuel_meal(uuid) from public;
grant execute on function public.log_fuel_pick(uuid, integer, text) to authenticated;
grant execute on function public.unlog_fuel_meal(uuid) to authenticated;
