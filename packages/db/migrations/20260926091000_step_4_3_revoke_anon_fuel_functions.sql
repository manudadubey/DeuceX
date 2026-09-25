-- Step 4.3 follow-up: Supabase's default privileges grant execute on new
-- public functions to anon explicitly, so the migration's "revoke ... from
-- public" left anon able to call both. Each already refuses a caller with no
-- auth.uid(); this closes the grant too (the step 1.1 fix, again).
revoke execute on function public.log_fuel_pick(uuid, integer, text) from anon;
revoke execute on function public.unlog_fuel_meal(uuid) from anon;
