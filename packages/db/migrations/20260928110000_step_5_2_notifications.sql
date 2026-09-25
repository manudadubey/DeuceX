-- Step 5.2: notification delivery (PRD-00 5.6 M-NOTIF-1 to M-NOTIF-3, PRD-12 4.5, ST-9, ST-10).
--
-- The notifications table (step 0.2) stays the one record of what a player
-- was told and what the in-app rail shows. Delivery by email and push is
-- planned per notification by apps/api's delivery sweep and recorded here,
-- one row per channel:
-- * notifications.deadline_at: set on an entry-deadline notification.
--   Inside 24 hours of it, quiet hours don't hold that notification
--   (M-NOTIF-2, ST-AC-7).
-- * notifications.delivery_planned_at: set once the sweep has decided each
--   channel. Every existing notification is backfilled as planned, so
--   turning delivery on never emails or pushes the backlog.
-- * notification_deliveries: one row per notification and channel, with the
--   time it becomes due (after quiet hours) and what happened. 'digest'
--   means it went into the weekly digest instead (M-NOTIF-3).
-- * notification_digests: one weekly FYI digest per player and week.
-- * push_subscriptions: the player's Web Push endpoints (owner decision 26
--   September 2026: Web Push now, native push with step 5.3). A player can
--   add and remove their own; only apps/api's service role sends.
-- * alerts.emailed_at: staff alert email delivery by alert_routes (step 5.1
--   stored the routing; this step delivers). Backfilled for existing alerts.
--
-- Owner decision, 26 September 2026: a player's own notification settings
-- are their standing consent for notification emails and pushes to
-- themselves. Nothing here can address anyone else.

alter table public.notifications
  add column deadline_at timestamptz,
  add column delivery_planned_at timestamptz;

update public.notifications set delivery_planned_at = now() where delivery_planned_at is null;

create index notifications_unplanned_idx on public.notifications (created_at)
  where delivery_planned_at is null;

create table public.notification_digests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  week_start date not null,
  item_count int not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (player_id, week_start)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'digest', 'skipped')),
  due_at timestamptz not null,
  held_for_quiet_hours boolean not null default false,
  attempts int not null default 0,
  sent_at timestamptz,
  digest_id uuid references public.notification_digests (id),
  error text,
  created_at timestamptz not null default now(),
  unique (notification_id, channel)
);

create index notification_deliveries_due_idx on public.notification_deliveries (due_at)
  where status = 'pending';
create index notification_deliveries_player_idx on public.notification_deliveries
  (player_id, channel, created_at);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  disabled_at timestamptz
);

create index push_subscriptions_player_idx on public.push_subscriptions (player_id);

alter table public.notification_digests enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.push_subscriptions enable row level security;

-- Delivery bookkeeping is apps/api's alone; players don't read or write it.
revoke all on public.notification_deliveries, public.notification_digests from anon, authenticated;

-- A player manages their own devices: list, add, remove. No update.
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (player_id = auth.uid());
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated with check (player_id = auth.uid());
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (player_id = auth.uid());

alter table public.alerts add column emailed_at timestamptz;
update public.alerts set emailed_at = now() where emailed_at is null;
