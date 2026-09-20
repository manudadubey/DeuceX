-- Follow-up to the previous fix: `revoke all on function ... from public`
-- does not touch the explicit per-role EXECUTE grants that Supabase's own
-- `alter default privileges in schema public` already made to anon,
-- authenticated and service_role at CREATE FUNCTION time (confirmed by
-- querying information_schema.role_routine_grants: anon still had EXECUTE
-- on both functions after the previous migration). PUBLIC and these named
-- default-privilege grants are separate things in Postgres; revoking one
-- does not revoke the other. Each grant has to be revoked from the specific
-- role that actually holds it.
--
-- notes_saved_this_month_for(uuid) is the one that mattered: anon and
-- authenticated could call it directly via
-- /rest/v1/rpc/notes_saved_this_month_for with any player id and read that
-- player's saved-note count, exactly the leak the previous migration meant
-- to close by moving the explicit-id lookup behind a service_role-only
-- grant. notes_saved_this_month() (auth.uid()-scoped, no argument) never
-- leaked player data to anon since it only reports the caller's own count,
-- but anon has no meaningful auth.uid() anyway, so revoking it there too
-- removes a pointless grant rather than fixing a real hole.

revoke execute on function public.notes_saved_this_month() from anon;
revoke execute on function public.notes_saved_this_month_for(uuid) from anon, authenticated;
