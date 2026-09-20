-- Step 1.1: notes and the recorder (Match Scribe).
-- Source: PRD-02-Match-Scribe.md (all), PRD-00 M-PRIV-1, M-LANG-2, decisions
-- worksheet item 3 (seven-day audio retention, not the prototype's ninety).
--
-- Design notes (see docs/BUILD-LOG.md for the full write-up):
-- * TECH-ARCHITECTURE.md 2.2 gives `notes` a shorter field list than PRD-02
--   section 6's data dictionary (no lang confidence, no round/surface split,
--   no per-run transcription/extraction audit, no edits array). Section 6 is
--   the more specific source for this table and PRD-02 section 3's own
--   "Audit" paragraph requires transcription model/version, detected
--   language and confidence, extraction model/prompt/schema versions and
--   validation result, and the player's edits to each proposed field to be
--   recorded on the note — so this migration follows PRD-02's fuller shape
--   and treats TECH-ARCHITECTURE's table as the indicative summary it says
--   it is.
-- * Structured extraction (res, opp, tags, mood, summary as agent proposals)
--   is step 1.2, not this step. The columns are created now, since they are
--   part of PRD-02's own note shape and the review screen lets the player
--   set them by hand before the extractor exists; step 1.2 only starts
--   writing into `extraction` and populating them as proposals, no new
--   migration.
-- * No SQL DELETE on `notes`, ever, for a saved note. S-14's "Delete this
--   note and its audio? Agents lose it too" reads as a hard delete from the
--   player's side, but `audioDeleteCause` in section 6 includes the value
--   'playerDelete', which only means something if the row survives to carry
--   it — matching how this project already treats deletion as an audited
--   state transition, not a row removal (players.deletion_* is the same
--   pattern). Delete is therefore a soft delete: content and audio_ref are
--   cleared, status becomes 'deleted', and every read path in the app
--   filters status = 'deleted' out, which is what "agents lose it too"
--   actually requires. A note that never reached 'saved' (Discard, or a
--   note the player walks away from mid-review) has nothing depending on it
--   yet and is hard-deleted by the API instead; see apps/api's notes routes.
-- * Quota (S-16, section 7): "saved notes in the player's local calendar
--   month; discarded and failed notes do not count." Rather than a second
--   `note_quotas` counter table that could drift from the notes it's
--   counting, `notes_saved_this_month` below computes it directly, scoped to
--   the player's own `players.timezone` so the month boundary matches what
--   the player sees on their own clock, not UTC.
-- * `used` (which agents have consumed this note) and `edits` (the audit of
--   the player's corrections to a proposed field) are platform-written
--   jsonb arrays, matching `notes.tags`/`notes.cond` already being jsonb in
--   TECH-ARCHITECTURE.md 2.2 rather than a Postgres array type.
-- * Column-level grants split the row the same way step 0.2 split
--   `notifications` and `share_links`: a player may edit only the content
--   fields on their own note (transcript, context and the review-state
--   proposals) directly through RLS, matching the confirmApproval pattern
--   of "the player's own session is the real authorization." Everything
--   that touches audio (upload, deletion) or the transcription/extraction
--   pipeline goes through apps/api on the service role, because it is
--   already making the vendor call (R2, Whisper) that column exists to
--   record — see apps/api/src/notes.

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  ctx text not null check (ctx in ('match', 'practice', 'travel', 'other')),
  recorded_at timestamptz not null default now(),
  dur_seconds integer not null default 0 check (dur_seconds between 0 and 60),

  -- Audio (Cloudflare R2, player-scoped keys). Null audio_ref means the
  -- audio was never uploaded (still queued offline) or has been deleted.
  audio_ref text,
  audio_uploaded_at timestamptz,
  audio_deleted_at timestamptz,
  audio_delete_cause text check (
    audio_delete_cause in ('confirmed', 'expired', 'player_delete', 'account_delete')
  ),

  -- Transcription (Whisper or the mock adapter).
  lang text,
  lang_conf numeric check (lang_conf is null or lang_conf between 0 and 1),
  lang_source text check (lang_source in ('whisper', 'preference')),
  transcript_raw text,
  transcript text,
  transcript_confirmed_at timestamptz,
  transcription jsonb, -- {model, version, cost}

  -- Structured extraction proposals (step 1.2 populates these; the player
  -- may also set them by hand in review before the extractor exists).
  result text,
  opponent text,
  round text check (round in ('Q1', 'Q2', 'Q3', 'R1', 'R2', 'R3', 'QF', 'SF', 'F')),
  surface text,
  tags jsonb not null default '[]'::jsonb,
  mood text check (mood in ('frustrated', 'flat', 'confident', 'energised')),
  summary text check (summary is null or char_length(summary) <= 220),
  extraction jsonb, -- {model, promptVersion, schemaVersion, valid, cost}
  edits jsonb not null default '[]'::jsonb,

  -- Conditions stamp (PRD-08; attached automatically or left null).
  cond jsonb,

  coach_share boolean not null default true,
  used jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (
    status in (
      'queued', 'uploaded', 'transcribing', 'review', 'saved',
      'failed_transcription', 'failed_extraction', 'deleted'
    )
  ),

  device text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.notes is
  'Match Scribe notes (PRD-02). Central to Mindset Coach, Content Agent, Tournament Agent and Conditions. Never SQL-deleted; see the design note above for why Delete is a soft transition to status = ''deleted''.';

create index notes_player_recorded_idx on public.notes (player_id, recorded_at desc);
create index notes_player_status_idx on public.notes (player_id, status);

alter table public.notes enable row level security;

create policy notes_select_own on public.notes
  for select
  to authenticated
  using (player_id = auth.uid());

-- Row creation (upload) always goes through apps/api on the service role,
-- since it is already writing audio_ref after the R2 upload; no
-- authenticated-role insert policy is needed or granted.

create policy notes_update_own on public.notes
  for update
  to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

revoke update, delete on public.notes from authenticated;
grant update (
  ctx, transcript, result, opponent, round, surface, tags, mood, summary,
  coach_share, status, deleted_at, updated_at
) on public.notes to authenticated;

create function public.set_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_notes_updated_at();

-- Saved-this-month count for the Free-tier quota (S-16, section 7), scoped
-- to the player's own timezone so the month boundary matches their clock
-- rather than UTC. security definer because a player's RLS grant only
-- covers their own rows anyway (the function still filters on player_id),
-- but this lets it be called once as a single round trip instead of the
-- caller fetching players.timezone first.
create function public.notes_saved_this_month(p_player_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.notes n
  join public.players p on p.id = n.player_id
  where n.player_id = p_player_id
    and n.status = 'saved'
    and date_trunc('month', n.recorded_at at time zone p.timezone)
      = date_trunc('month', now() at time zone p.timezone)
$$;

comment on function public.notes_saved_this_month is
  'Free-tier quota (S-16): saved notes in the players own local calendar month. Discarded and failed notes are never in status = saved, so they are excluded without a separate check.';

revoke all on function public.notes_saved_this_month(uuid) from public;
grant execute on function public.notes_saved_this_month(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- check_ins: the daily mood check-in (PRD-02 section 4.4, read by PRD-06).
-- ---------------------------------------------------------------------------
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  date date not null,
  value integer not null check (value between 1 and 5),
  sentence text,
  source text not null check (source in ('scribe', 'dashboard', 'mindset')),
  created_at timestamptz not null default now(),
  unique (player_id, date)
);

comment on table public.check_ins is
  'One 1-5 mood value per player per local day (PRD-02 section 4.4); a later save on the same day replaces it rather than adding a second row.';

alter table public.check_ins enable row level security;

create policy check_ins_select_own on public.check_ins
  for select
  to authenticated
  using (player_id = auth.uid());

create policy check_ins_insert_own on public.check_ins
  for insert
  to authenticated
  with check (player_id = auth.uid());

create policy check_ins_update_own on public.check_ins
  for update
  to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

revoke update on public.check_ins from authenticated;
grant update (value, sentence, source) on public.check_ins to authenticated;
