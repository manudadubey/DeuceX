-- Step 4.2: Content Agent (patron updates).
-- Source: PRD-05 (all), decisions worksheet 8 (one tap on the dashboard card
-- with the consequence sentence printed on it; two steps on the agent page)
-- and 9 (one patron-update language in Release 1), PRD-00 M-GATE-1..4.
--
-- Design notes (see docs/BUILD-LOG.md's step 4.2 entry for the full write-up):
-- * patron_updates is one row per draft run (PRD-05 section 6), one language
--   per row in Release 1. It is service-role written and player-read only,
--   the same "system writes, player reads" shape as step 4.1's tables: every
--   edit, rewrite, skip and publish goes through apps/api, which re-runs the
--   four checks on each save (C-10) and refuses edits once a row has left the
--   draft state.
-- * A queued row is the draft window itself (C-1): saving a match note with a
--   result inserts status queued with due_at = now + the player's window, and
--   a five-minute tick drafts every due row. No separate trigger table.
-- * One open draft per player (PRD-05 section 3), enforced by a partial
--   unique index. A newer note while a draft is open is recorded on the open
--   row as rebuild_note_id ("Rebuild from the new note") rather than queuing
--   a second draft.
-- * "The agent does not redraft from the same note" (C-15) is a partial
--   unique index on note_id for note-triggered rows.
-- * approvals.action_type 'content_publish' has been reserved since step 0.2
--   and is unchanged here. A scheduled update records its approval id at
--   confirm time; the approval is claimed (runGatedAction) only at send
--   time, so a cancelled schedule never consumes it and nothing sends
--   without it.
-- * patron_update_sends is one row per patron per update: the Resend email
--   id, delivery status and the open event polled back from Resend (owner
--   decision this session: poll, since apps/api has no public URL for a
--   webhook yet). It feeds history open rates and patrons.opens.
-- * players gains three player-written settings: content_window (Settings >
--   Agents), content_private_names (the Voice profile's names kept private,
--   read by the coach check) and profile_teaser (Profile's "Latest update
--   teaser" switch). They join the column grant list.

-- ---------------------------------------------------------------------------
-- patron_updates
-- ---------------------------------------------------------------------------
create table public.patron_updates (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  trigger text not null check (trigger in ('note', 'result', 'manual', 'fans_pass', 'rebuild')),
  note_id uuid references public.notes (id) on delete set null,
  status text not null default 'queued' check (
    status in (
      'queued', 'drafting', 'draft', 'scheduled', 'sending', 'published',
      'send_failed', 'skipped', 'superseded'
    )
  ),
  due_at timestamptz,
  lang char(2) not null default 'en',
  subject text not null default '',
  alt_subjects text[] not null default '{}',
  body text not null default '',
  practice_section text,
  generated_subject text,
  generated_body text,
  draft_failed boolean not null default false,
  drafted_at timestamptz,
  checks jsonb not null default '[]'::jsonb,
  overrides text[] not null default '{}',
  built_from jsonb not null default '[]'::jsonb,
  people jsonb not null default '[]'::jsonb,
  tier_ids uuid[] not null default '{}',
  tier_reasons jsonb not null default '{}'::jsonb,
  send_at timestamptz,
  teaser boolean not null default true,
  teaser_removed_at timestamptz,
  rebuild_note_id uuid references public.notes (id) on delete set null,
  agent_run_id uuid references public.agent_runs (id),
  approval_id uuid references public.approvals (id),
  approved_at timestamptz,
  sent_at timestamptz,
  recipient_count integer,
  delivered_count integer,
  skip_reason text,
  skipped_at timestamptz,
  send_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patron_updates is
  'PRD-05 section 6. One patron update per draft run, one language per row in Release 1 (worksheet 9). Service-role written through apps/api; the player reads. body is the current (edited) text, generated_body the original for Restore original.';

create unique index patron_updates_one_open_draft_idx
  on public.patron_updates (player_id)
  where status in ('queued', 'drafting', 'draft');

create unique index patron_updates_one_per_note_idx
  on public.patron_updates (note_id)
  where note_id is not null and trigger in ('note', 'rebuild');

create index patron_updates_player_idx on public.patron_updates (player_id, created_at desc);
create index patron_updates_due_idx on public.patron_updates (due_at) where status = 'queued';
create index patron_updates_send_idx on public.patron_updates (send_at) where status = 'scheduled';

alter table public.patron_updates enable row level security;

create policy patron_updates_select_own on public.patron_updates
  for select
  to authenticated
  using (player_id = auth.uid());

revoke insert, update, delete on public.patron_updates from authenticated, anon;

create trigger patron_updates_set_updated_at
  before update on public.patron_updates
  for each row execute function public.set_notes_updated_at();

-- ---------------------------------------------------------------------------
-- patron_update_sends
-- ---------------------------------------------------------------------------
create table public.patron_update_sends (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.patron_updates (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  patron_id uuid not null references public.patrons (id) on delete cascade,
  tier_id uuid references public.patron_tiers (id) on delete set null,
  status text not null check (status in ('sent', 'failed')),
  email_id text,
  error text,
  sent_at timestamptz not null default now(),
  last_event text,
  opened_at timestamptz,
  last_checked_at timestamptz,
  unique (update_id, patron_id)
);

comment on table public.patron_update_sends is
  'PRD-05 section 7: one email per patron per update. email_id is Resend''s; last_event/opened_at are polled back from Resend for open rates (C-16) and patrons.opens (PRD-04 P-5).';

create index patron_update_sends_poll_idx
  on public.patron_update_sends (sent_at)
  where status = 'sent' and opened_at is null;

alter table public.patron_update_sends enable row level security;

create policy patron_update_sends_select_own on public.patron_update_sends
  for select
  to authenticated
  using (player_id = auth.uid());

revoke insert, update, delete on public.patron_update_sends from authenticated, anon;

-- ---------------------------------------------------------------------------
-- players: three player-written Content Agent settings
-- ---------------------------------------------------------------------------
alter table public.players
  add column content_window text not null default 'thirty_minutes'
    check (content_window in ('thirty_minutes', 'next_morning', 'manual')),
  add column content_private_names text[] not null default '{}',
  add column profile_teaser boolean not null default true;

comment on column public.players.content_window is
  'PRD-05 section 3: when a draft runs after a saved match note. "Within 30 minutes" (default), "Next morning 06:30" local, or "Only when I ask".';
comment on column public.players.content_private_names is
  'PRD-05 C-10/section 7: names from the player''s coach or team kept out of patron updates. Read by the coach check alongside names the drafting call finds in the note.';
comment on column public.players.profile_teaser is
  'PRD-05 C-13: Profile''s "Latest update teaser" switch. When off, no teaser shows on the public page whatever each update''s own teaser flag says.';

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
  content_window, content_private_names, profile_teaser
) on public.players to authenticated;
