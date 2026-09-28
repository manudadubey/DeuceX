-- Calendar import (28 September 2026): one row per event. The importer
-- already treats tour, name (trimmed, case-insensitive) and start date as the
-- same event, but it checked before writing, so two overlapping Apply requests
-- (a double-click, or a reload during a slow save) could both insert it. This
-- makes the database refuse the second copy. Additive: production had 302
-- events and no duplicates under this key when it was written.
create unique index tournaments_event_key
  on public.tournaments (tour, lower(btrim(name)), start_date);
