-- Step 5.1 follow-up: let apps/api's connection (the postgres user) switch
-- to the console role with `set local role console`.
--
-- The step 0.2 migration created `console`, and Supabase recorded the
-- postgres user's membership with set_option = false (Postgres 16 splits
-- membership into ADMIN, INHERIT and SET), so SET ROLE was refused. Found
-- by the step 5.1 live integration tests. INHERIT stays false on purpose:
-- postgres never picks up console's grants implicitly, only inside a
-- transaction that explicitly switches.
grant console to postgres with set true, inherit false;
