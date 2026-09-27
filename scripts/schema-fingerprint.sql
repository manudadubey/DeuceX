-- Schema fingerprint (step 5.4): run on production and on staging (Supabase SQL editor or
-- the MCP's execute_sql) and compare the hashes. Equal hashes mean the DeuceX tables match on
-- columns, constraints, indexes, policies, RLS switches, table and column grants, public
-- functions and triggers. Production's unrelated match-charting tables are excluded.
with ex as (select unnest(array['matches','points']) t),
tbls as (select c.oid, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and c.relname not in (select t from ex) and c.relname not like 'stats\_%'),
cols as (select string_agg(format('%s.%s:%s:%s:%s', table_name, column_name, data_type, is_nullable, coalesce(column_default,'')), '|' order by table_name, column_name) s
  from information_schema.columns where table_schema='public' and table_name in (select relname from tbls)),
cons as (select string_agg(format('%s.%s:%s', t.relname, c.conname, pg_get_constraintdef(c.oid)), '|' order by t.relname, c.conname) s
  from pg_constraint c join tbls t on t.oid=c.conrelid),
idx as (select string_agg(indexdef, '|' order by indexname) s from pg_indexes where schemaname='public' and tablename in (select relname from tbls)),
pol as (select string_agg(format('%s.%s:%s:%s:%s:%s', tablename, policyname, roles::text, cmd, coalesce(qual,''), coalesce(with_check,'')), '|' order by tablename, policyname) s
  from pg_policies where schemaname='public' and tablename in (select relname from tbls)),
rls as (select string_agg(format('%s:%s', relname, c.relrowsecurity), '|' order by relname) s from pg_class c where oid in (select oid from tbls)),
tg as (select string_agg(format('%s.%s:%s', table_name, grantee, privilege_type), '|' order by table_name, grantee, privilege_type) s
  from information_schema.role_table_grants where table_schema='public' and table_name in (select relname from tbls) and grantee in ('anon','authenticated','service_role','console','grafana_reader')),
cg as (select string_agg(format('%s.%s.%s:%s', table_name, column_name, grantee, privilege_type), '|' order by table_name, column_name, grantee, privilege_type) s
  from information_schema.column_privileges where table_schema='public' and table_name in (select relname from tbls) and grantee in ('anon','authenticated','console','grafana_reader')),
fn as (select string_agg(md5(pg_get_functiondef(p.oid)) || ':' || p.proname || ':' || coalesce(array_to_string(p.proacl::text[], ','), ''), '|' order by p.proname) s
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
trg as (select string_agg(format('%s:%s', t.tgname, pg_get_triggerdef(t.oid)), '|' order by t.tgname) s
  from pg_trigger t where not t.tgisinternal and t.tgrelid in (select oid from tbls))
select (select count(*) from tbls) tables, md5((select s from cols)) cols, md5((select s from cons)) cons, md5((select s from idx)) idx,
  md5((select s from pol)) pol, md5((select s from rls)) rls, md5((select s from tg)) tgrants, md5((select s from cg)) colgrants,
  md5((select s from fn)) fns, md5((select s from trg)) trg;
