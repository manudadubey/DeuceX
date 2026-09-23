-- Step 2.3: Settings, preferences, sharing.
-- Source: PRD-12-Settings-Preferences-Sharing.md (all), decisions worksheet 4, 12, 13,
-- TECH-ARCHITECTURE.md sections 2.2, 2.3, 3, 6.
--
-- Design notes (see docs/BUILD-LOG.md for the full write-up):
-- * `players.patron_language` stays singular. PRD-12 section 4.3 describes a multi-select
--   "Patron-update languages"; decisions worksheet 9 ("One draft per language") already
--   resolved this against the PRD's own prose: "the multi-select becomes single-select for
--   Release 1." The schema already matches the decision record, not the PRD text, so nothing
--   changes here.
-- * The five new deletion/export timestamp and token columns are deliberately left OUT of the
--   players column-grant list below: they are the one part of this step's schema a player must
--   never be able to write directly, only apps/api's service role (packages/actions'
--   confirmAccountDeletion/cancelAccountDeletion/requestAccountDeletion/requestDataExport).
--   deletion_requested_at/effective_at/cancelled_at already existed, unused, since step 0.2.
-- * The players column-level grant lockdown itself closes a gap step 0.2 explicitly flagged:
--   "Column-level limits on sensitive fields (verification, tier, deletion_*) are deferred to
--   the settings/billing steps that actually own those transitions." This step owns exactly
--   the deletion_*/export_* transitions, so those are what get locked down. `verification` and
--   `tier`/`tier_status` stay player-writable via the blanket-turned-explicit grant below,
--   because locking THOSE down is step 3.1's (ranking verification) and the billing step's job
--   respectively, not this one — matching step 1.4's own discipline of only closing the gap the
--   current step actually owns, not everything found along the way. Verified safe against
--   every existing write path before writing the grant list: packages/db/src/players.ts's
--   finishOnboarding() upserts tour_rank/tour_points/itf_rank/wtn/verification/stage/tier/
--   tier_status/billing_cycle/etc. through the player's own RLS session (its own comment says
--   so explicitly), and none of those columns are in the excluded set, so onboarding and its
--   "Replay setup" flow are unaffected by this migration.
-- * `share_links` needs no schema or grant change: its existing select_own/insert_own/
--   update_own(revoked, renewed_at, expires_at) grants (step 0.2) already cover everything a
--   signed-in player does with their own links. What's new is a *read path with no player
--   session at all* (a coach or manager opening the link), which cannot go through RLS — there
--   is no auth.uid() for an anonymous visitor to satisfy. That path is apps/api's new
--   GET /sharing/:token route, reading via the service role, which bypasses RLS by design, the
--   same idiom already used for markReceivableReceived and the notes audio sweep. Nothing here
--   grants `anon` any access to `share_links`; the RLS integration test added by this step
--   proves a direct anon select is still refused, so the service-role route is the only path in.
-- * approvals.action_type gets two additive values, same drop-then-recreate pattern step 2.1
--   used for 'receivable_received': 'account_deletion_request' and 'data_export_request'. Both
--   are the only two Settings writes with a real vendor side effect (a Resend send, gated
--   through packages/actions per TECH-ARCHITECTURE.md section 3 and CLAUDE.md's own opening
--   line: "nothing leaves the app... without a player-authored row in approvals"). Every other
--   Settings write (preferences, notification toggles, agent pause, share-link create/revoke/
--   renew, downgrade to Free, cancelling a pending deletion) stays a plain RLS-scoped write,
--   the same split step 2.2 established for expense_save/balance_update.
-- * notification_prefs is one jsonb column, not a normalised table: PRD-12's own data
--   dictionary describes it as "object per event x channel" on the player settings record, and
--   decisions worksheet 13 fixed the shape to two categories (for_you, fyi) per agent x three
--   channels. A missing agent key or missing category/channel key means "on", the same
--   "no row = default" idiom agent_schedules already uses, so a player who has never touched
--   Notifications still gets every channel by default.
-- * reserve_reminder_enabled and quiet_hours_start/end close the follow-up both step 2.1 and
--   step 2.2's BUILD-LOG entries flagged by name ("the Sunday balance-reminder's quiet hours
--   and per-player toggle... step 2.3"). Quiet hours are one pair of columns shared by every
--   notification, not reserve-reminder-specific, so apps/api/src/reserves/scheduler.ts (which
--   already reads timezone per player) reads these two alongside reserve_reminder_enabled.

alter table public.players
  add column spoken_language text not null default 'auto',
  add column date_format text not null default 'DMY'
    check (date_format in ('DMY', 'MDY', 'ISO')),
  add column quiet_hours_start time not null default '22:00',
  add column quiet_hours_end time not null default '07:00',
  add column notification_prefs jsonb not null default '{}'::jsonb,
  add column emergency_contact text,
  add column reserve_reminder_enabled boolean not null default true,
  add column deletion_confirmation_token text,
  add column deletion_confirmation_sent_at timestamptz,
  add column export_requested_at timestamptz,
  add column export_delivered_at timestamptz;

comment on column public.players.spoken_language is
  'Match Scribe language override (M-LANG-2): auto or a fixed language code. Auto lets Whisper detect mid-note switches.';
comment on column public.players.notification_prefs is
  'Per-agent {for_you, fyi} x {in_app, email, push} (PRD-12 ST-9, decisions worksheet 13). Missing agent/category/channel key means on, same default-by-absence idiom as agent_schedules.';
comment on column public.players.deletion_confirmation_token is
  'Single-use token emailed on an account-deletion request (packages/actions requestAccountDeletion); cleared once confirmAccountDeletion consumes it. Service-role write only, see grant lockdown below.';

create unique index players_deletion_confirmation_token_idx
  on public.players (deletion_confirmation_token)
  where deletion_confirmation_token is not null;

-- ---------------------------------------------------------------------------
-- players column-grant lockdown (see design notes above).
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
  notification_prefs, emergency_contact, reserve_reminder_enabled
) on public.players to authenticated;

-- Deliberately NOT granted to authenticated: deletion_requested_at,
-- deletion_effective_at, deletion_cancelled_at, deletion_confirmation_token,
-- deletion_confirmation_sent_at, export_requested_at, export_delivered_at.
-- Only the service role (apps/api) ever writes these.

-- ---------------------------------------------------------------------------
-- approvals.action_type: two additive values for this step's two Resend-backed
-- gated actions.
-- ---------------------------------------------------------------------------
alter table public.approvals drop constraint approvals_action_type_check;
alter table public.approvals add constraint approvals_action_type_check check (
  action_type in (
    'entry_confirm', 'expense_save', 'balance_update', 'patron_send',
    'content_publish', 'sponsor_send', 'retract', 'tier_change',
    'receivable_received', 'account_deletion_request', 'data_export_request'
  )
);
