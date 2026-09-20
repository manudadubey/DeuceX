-- The Supabase security advisor flagged reject_fx_rates_daily_mutation() for
-- a mutable search_path right after step_0_2_foundation was applied (a known
-- Postgres privilege-escalation vector for SECURITY DEFINER-adjacent
-- functions). Pin it explicitly.
alter function public.reject_fx_rates_daily_mutation() set search_path = '';
