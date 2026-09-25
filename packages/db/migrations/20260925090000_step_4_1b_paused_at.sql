-- Step 4.1b, follow-up: the 90-day limit on a paused membership (owner
-- decision, 25 September 2026). PRD-04 P-18 says billing resumes "if the
-- player returns within 90 days" but not what happens after; the owner chose
-- to end the membership at 90 days with a goodbye email to the patron.
--
-- One additive, nullable column: when this patron's billing was paused.
-- Set by the gated pause (and the webhook's pause sync), cleared on resume,
-- and read by the daily sweep that ends memberships paused for 90 days.
-- Service-role written like every other patrons column; no policy change.
alter table public.patrons add column paused_at timestamptz;

comment on column public.patrons.paused_at is
  'When billing was paused (P-18). Set with status paused, cleared on resume. A membership paused for 90 days is ended by the daily sweep (owner decision, 25 Sep 2026).';
