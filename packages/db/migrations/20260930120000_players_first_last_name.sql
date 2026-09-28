-- First and last name (owner decision, 28 September 2026): onboarding and
-- Settings > Account ask for them separately. Additive: `name` stays and is
-- still written as "First Last" by every writer (finishOnboarding,
-- updateAccount), so everything that reads it (the sidebar, the public
-- page, the ranking directory match, email sender names, the console) is
-- unchanged. Nullable so an existing row is never invalid; the app requires
-- both for new writes.
alter table public.players
  add column first_name text,
  add column last_name text;

-- Backfill: first word, then the rest. Only an approximation for names like
-- "Juan Martín del Potro"; the player can correct it in Settings > Account.
update public.players
set first_name = split_part(btrim(name), ' ', 1),
    last_name = nullif(btrim(substr(btrim(name), length(split_part(btrim(name), ' ', 1)) + 1)), '')
where first_name is null;

-- Column grants add to the existing lists (step 2.3 and billing session 1).
grant insert (first_name, last_name) on public.players to authenticated;
grant update (first_name, last_name) on public.players to authenticated;
