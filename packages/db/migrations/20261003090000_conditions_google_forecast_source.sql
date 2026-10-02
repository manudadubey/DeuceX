-- Google's Weather API as the Conditions forecast source (owner decision,
-- 3 October 2026): Open-Meteo's free API excludes commercial use. Widens the
-- step 3.3 check so a brief can record 'google'. Google's terms allow a
-- daily forecast to be kept for 24 hours, so apps/api refreshes every
-- google-sourced brief within that window (conditions/refresh-scheduler.ts);
-- the index below serves that sweep. Existing rows are unchanged.
alter table public.conditions_briefs
  drop constraint conditions_briefs_forecast_source_check;

alter table public.conditions_briefs
  add constraint conditions_briefs_forecast_source_check
  check (forecast_source in ('google', 'open-meteo', 'climate-normals'));

create index conditions_briefs_google_forecast_at_idx
  on public.conditions_briefs (forecast_at)
  where forecast_source = 'google';
