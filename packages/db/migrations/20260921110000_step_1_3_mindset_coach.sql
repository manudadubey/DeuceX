-- Step 1.3: Mindset Coach.
-- Source: PRD-06-Mindset-Coach.md (all), PRD-00 M-PRIV-3, decisions worksheet 17,
-- TECH-ARCHITECTURE.md section 2.4 (the cases table) and section 3 (the queue).
--
-- Design notes (see docs/BUILD-LOG.md for the full write-up):
-- * PRD-06 section 6 gives Insight and Pattern their own data dictionaries
--   distinct from TECH-ARCHITECTURE.md 2.2's shorter `patterns` sketch (no
--   `ev`/evidence, no `recurSince`, no `coachShare`) — same relationship as
--   step 1.1's notes table to TECH-ARCHITECTURE's summary: the PRD's fuller
--   shape wins.
-- * `patterns` is keyed on (player_id, rule_key) rather than freely created
--   per run: section 7's three worked examples ("after a tiebreak loss...",
--   "the day after travel...", "you skip writing after wins") describe a
--   small, fixed catalogue of candidate statements the detector evaluates
--   each run, not open-ended text generation, so a pattern's identity is the
--   rule that produced it, not its current wording. This is also what makes
--   re-raising after dismissal (section 7, MC-11) an update to the same row
--   rather than a duplicate.
-- * `mindset_boundaries` is a dedicated table, not a reuse of
--   `agent_schedules.paused`: that column is the admin/Elite-Studio kill
--   switch the pickup guard (packages/actions/src/queue/pickup-guard.ts)
--   reads generically for every agent, a different concern from a player's
--   own "Pause for a week" (MC-15), which needs a resume date and "resumes
--   automatically, deletes nothing" — product behaviour the generic pickup
--   guard has no notion of. Handled inside the agent's own run instead (see
--   packages/agents/src/mindset-coach). A missing row means the defaults
--   (both switches on, not paused), same "no row = default" idiom
--   `agent_schedules` already uses.
-- * `cases` is TECH-ARCHITECTURE.md 2.4's admin table, built here ahead of
--   the admin console itself (PRD-13, Phase 5) because M-PRIV-3/MC-16
--   require the distress card to "open a case in the admin data model" from
--   week one. Column list matches 2.4 exactly, so PRD-13's own step is an
--   additive read/write surface on top, not a redefinition. No role has a
--   select grant: this is staff-only data the service role writes and later
--   the console reads under its own role (PRD-13), and a player must never
--   see their own case row (that would defeat "it stops coaching and points
--   you to real people" being a private safety net, not another feed item).
create table public.patterns (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  rule_key text not null,
  kind text not null check (kind in ('mental', 'physical')),
  tag text not null,
  statement text not null,
  explanation text not null,
  evidence jsonb not null default '[]'::jsonb,
  confidence text not null check (confidence in ('emerging', 'strong')),
  dismissed boolean not null default false,
  dismissed_at timestamptz,
  recur_since integer not null default 0,
  coach_share boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, rule_key)
);

comment on table public.patterns is
  'Mental and physical patterns (PRD-06 section 6). One row per (player, rule_key): the detector updates statement/explanation/evidence/confidence in place each run rather than creating a new row, which is what makes dismiss-then-re-raise (MC-11) an update, not a duplicate.';

create index patterns_player_idx on public.patterns (player_id, dismissed);

alter table public.patterns enable row level security;

create policy patterns_select_own on public.patterns
  for select
  to authenticated
  using (player_id = auth.uid());

-- Row creation and the detector's own field updates (statement, evidence,
-- confidence, recur_since) are agent-run output, written by apps/api on the
-- service role, matching step 1.2's runExtraction writing extraction columns
-- directly. The player's own controls are narrower: MC-11's dismiss/undo
-- (dismissed, dismissed_at) and the "Coach sees patterns, not notes"
-- boundary's per-pattern mirror (coach_share) are the only columns a
-- player's own session may write.
create policy patterns_update_own on public.patterns
  for update
  to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

revoke update, delete on public.patterns from authenticated;
grant update (dismissed, dismissed_at, coach_share) on public.patterns to authenticated;

create trigger patterns_set_updated_at
  before update on public.patterns
  for each row execute function public.set_notes_updated_at();

-- ---------------------------------------------------------------------------
-- insights: one per player per local day (PRD-06 section 6).
-- ---------------------------------------------------------------------------
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  date date not null,
  lang text not null,
  inputs_hash text not null,
  provenance jsonb not null,
  body jsonb,
  focus text,
  focus_done boolean not null default false,
  focus_done_at timestamptz,
  memory jsonb,
  pattern_flag uuid references public.patterns (id),
  feedback text check (feedback in ('yes', 'not_today')),
  feedback_at timestamptz,
  delivery text not null check (
    delivery in ('delivered', 'quiet', 'paused', 'withheld', 'failed', 'distress')
  ),
  tone_check jsonb,
  distress jsonb,
  model text,
  prompt_version text,
  schema_version text,
  cost_amount numeric,
  cost_currency char(3),
  created_at timestamptz not null default now(),
  unique (player_id, date)
);

comment on table public.insights is
  'One Mindset Coach morning per player per local day (PRD-06 section 6). inputs_hash backs MC-1''s "not regenerated when nothing changed": a re-run that hashes the same inputs for a date that already has a row is a no-op, not a second model call.';

create index insights_player_date_idx on public.insights (player_id, date desc);

alter table public.insights enable row level security;

create policy insights_select_own on public.insights
  for select
  to authenticated
  using (player_id = auth.uid());

-- Row creation is the agent run's own write (apps/api, service role, same
-- split as notes/patterns above). The player's controls are the focus
-- checkbox (MC-12) and the feedback pair (MC-13).
create policy insights_update_own on public.insights
  for update
  to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

revoke update, delete on public.insights from authenticated;
grant update (focus_done, focus_done_at, feedback, feedback_at) on public.insights to authenticated;

-- ---------------------------------------------------------------------------
-- mindset_boundaries: the three player-set switches (PRD-06 section 6). See
-- the design note above for why this is separate from agent_schedules.
-- ---------------------------------------------------------------------------
create table public.mindset_boundaries (
  player_id uuid primary key references public.players (id) on delete cascade,
  quiet_match_mornings boolean not null default true,
  coach_sees_patterns boolean not null default true,
  paused_until date,
  updated_at timestamptz not null default now()
);

comment on table public.mindset_boundaries is
  'The Mindset Coach''s three boundary switches (PRD-06 "Your boundaries"). No row for a player means the defaults: both switches on, not paused.';

alter table public.mindset_boundaries enable row level security;

create policy mindset_boundaries_select_own on public.mindset_boundaries
  for select
  to authenticated
  using (player_id = auth.uid());

create policy mindset_boundaries_insert_own on public.mindset_boundaries
  for insert
  to authenticated
  with check (player_id = auth.uid());

create policy mindset_boundaries_update_own on public.mindset_boundaries
  for update
  to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

create trigger mindset_boundaries_set_updated_at
  before update on public.mindset_boundaries
  for each row execute function public.set_notes_updated_at();

-- ---------------------------------------------------------------------------
-- cases: the admin data model's safety/governance queue (TECH-ARCHITECTURE.md
-- 2.4), built now so the distress rule (M-PRIV-3, MC-16) has somewhere real
-- to write. See the design note above for why no role has a select grant.
-- ---------------------------------------------------------------------------
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('distress', 'report', 'guardian', 'governance')),
  player_id uuid not null references public.players (id) on delete cascade,
  opened_at timestamptz not null default now(),
  opened_by_rule text not null,
  excerpt text not null,
  due_at timestamptz,
  outcome text,
  resolved_by uuid,
  resolved_at timestamptz
);

comment on table public.cases is
  'Staff safety/governance queue (TECH-ARCHITECTURE.md 2.4). The distress rule (M-PRIV-3) opens a kind = distress row here on every fire; PRD-13''s admin console (Phase 5) is what reads and resolves it. No select grant for anon/authenticated: a player never sees their own case row.';

create index cases_player_idx on public.cases (player_id, opened_at);
create index cases_kind_opened_idx on public.cases (kind, opened_at);

alter table public.cases enable row level security;

revoke all on public.cases from anon, authenticated;
