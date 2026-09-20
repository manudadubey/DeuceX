-- One-off cleanup: verifying step_0_2_foundation's RLS isolation and the
-- fx_rates_daily insert-only trigger required inserting two rows into the
-- shared project's fx_rates_daily table (there was no local branch available
-- to test against instead). This removes them. On a fresh environment the
-- delete is a no-op, since the rows were never inserted there.
alter table public.fx_rates_daily disable trigger fx_rates_daily_no_delete;
delete from public.fx_rates_daily where date = '2026-09-10' and currency = 'AUD' and source in ('provisional', 'ecb');
alter table public.fx_rates_daily enable trigger fx_rates_daily_no_delete;
