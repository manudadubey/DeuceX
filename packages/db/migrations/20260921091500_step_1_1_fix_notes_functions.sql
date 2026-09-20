-- The security advisor flagged two real issues in the step 1.1 migration
-- right after it was applied, same class of follow-up step 0.2 needed for
-- reject_fx_rates_daily_mutation():
--
-- 1. set_notes_updated_at() had a mutable search_path (privilege-escalation
--    vector for any function callable by a lower-privileged role). Pinned.
-- 2. notes_saved_this_month(p_player_id uuid) took the player id as a caller-
--    supplied argument while running as SECURITY DEFINER, which bypasses RLS
--    by design — so any authenticated player could pass any other player's
--    id and read their saved-note count over the exposed
--    /rest/v1/rpc/notes_saved_this_month endpoint. Split into two functions
--    instead of one: a zero-argument version for a player's own browser
--    session, reading auth.uid() itself rather than trusting an argument
--    (the same trust boundary every other player-scoped policy in this
--    schema uses), and a service-role-only version for apps/api, which
--    already authenticates the request and needs to check a specific
--    player's quota while writing the note with the service-role client
--    (which bypasses RLS and has no auth.uid() of its own to read).

alter function public.set_notes_updated_at() set search_path = '';

drop function public.notes_saved_this_month(uuid);

create function public.notes_saved_this_month()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.notes n
  join public.players p on p.id = n.player_id
  where n.player_id = auth.uid()
    and n.status = 'saved'
    and date_trunc('month', n.recorded_at at time zone p.timezone)
      = date_trunc('month', now() at time zone p.timezone)
$$;

comment on function public.notes_saved_this_month is
  'Free-tier quota (S-16) for the calling player''s own browser session: saved notes in their own local calendar month, read from auth.uid() rather than a caller-supplied id so the SECURITY DEFINER privilege cannot be used to read another player''s count.';

revoke all on function public.notes_saved_this_month() from public;
grant execute on function public.notes_saved_this_month() to authenticated;

create function public.notes_saved_this_month_for(p_player_id uuid)
returns integer
language sql
stable
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

comment on function public.notes_saved_this_month_for is
  'Same quota count as notes_saved_this_month(), for an explicit player id. Not SECURITY DEFINER (no need to bypass RLS beyond what the caller already has) and granted only to service_role, so it is unreachable from a player session — apps/api is the only caller, already having authenticated the request and being the thing writing the note with the service-role client.';

revoke all on function public.notes_saved_this_month_for(uuid) from public;
grant execute on function public.notes_saved_this_month_for(uuid) to service_role;
