-- Step 3.1 follow-up: seed feed_status rows for the four ranking feeds
-- (PRD-13 AD-17). Without a row per feed there is nothing for the ingestion
-- page's cards to show and nothing for the missed-window check
-- (apps/api/src/rankings/feed-monitor.ts) to compare "now" against; each
-- feed starts with next_expected_at one week out and no prior run, an
-- honest "never refreshed yet" starting state rather than a fabricated
-- last_run_at.
insert into public.feed_status (feed, cadence, next_expected_at)
values
  ('atp_rankings', 'weekly', now() + interval '7 days'),
  ('wta_rankings', 'weekly', now() + interval '7 days'),
  ('itf_men_rankings', 'weekly', now() + interval '7 days'),
  ('itf_women_rankings', 'weekly', now() + interval '7 days')
on conflict (feed) do nothing;
