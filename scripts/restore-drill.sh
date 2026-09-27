#!/usr/bin/env bash
# The restore drill (step 5.4, TECH-ARCHITECTURE.md section 8; owner decision
# 26 September 2026: restore a production dump into a throwaway local
# Postgres, never into staging, which holds fixture data only).
#
# What it proves: a pg_dump of production restores cleanly into a fresh
# Postgres 17, with every DeuceX table's row count, RLS switch, policy count
# and the console role's column lockout matching production. The free
# Supabase plan has no managed backups, so this dump is the backup that
# exists; see ops/README.md for when to run it.
#
# Needs: SUPABASE_DB_URL in the repo's .env (the session pooler string),
# Homebrew postgresql@17 (pg_dump, pg_restore, initdb, pg_ctl, psql).
# Everything it writes lives in one mktemp directory, mode 700, removed on
# exit whether the drill passes or fails, so no copy of production data
# outlives the run. The report (counts only, no row data) is kept.
#
# Usage: scripts/restore-drill.sh [report-path]

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
report="${1:-$repo_root/ops/restore-drill-$(date -u +%Y%m%dT%H%M%SZ).md}"

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  # shellcheck disable=SC1091
  set -a && . "$repo_root/.env" && set +a
fi
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set}"

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
export PATH="$PG_BIN:$PATH"
# macOS: without a locale the postmaster refuses to start ("became
# multithreaded during startup").
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
port="${DRILL_PORT:-55432}"

work="$(mktemp -d -t deucex-restore-drill)"
chmod 700 "$work"
cleanup() {
  pg_ctl -D "$work/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Dumping production (public, auth, pgboss)..."
dump_start=$(date +%s)
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner \
  --schema=public --schema=auth --schema=pgboss \
  --file="$work/prod.dump"
dump_secs=$(( $(date +%s) - dump_start ))
dump_size=$(du -h "$work/prod.dump" | cut -f1)

echo "Starting a throwaway Postgres on port $port..."
initdb -D "$work/data" -U postgres --auth=trust >/dev/null
# TCP on localhost only: the mktemp path is too long for a Unix socket.
if ! pg_ctl -D "$work/data" -o "-p $port -c listen_addresses=localhost -c unix_socket_directories=''" \
  -l "$work/pg.log" -w start >/dev/null; then
  tail -5 "$work/pg.log" >&2
  exit 1
fi
local_url="postgresql://postgres@localhost:$port/postgres"

# The roles Supabase provides and DeuceX's grants and policies name. Created
# bare (no login) so the dump's ACLs and policies restore as written.
psql -q "$local_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','authenticator',
    'supabase_admin','supabase_auth_admin','supabase_storage_admin','dashboard_user',
    'pgbouncer','console','grafana_reader'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
SQL

echo "Restoring..."
restore_start=$(date +%s)
# Supabase-only extensions (pg_graphql, vault, pg_net) don't exist in stock
# Postgres, so a handful of statements that reference them fail; the drill
# counts those and checks the data and policies that matter instead.
set +e
pg_restore --no-owner --dbname="$local_url" "$work/prod.dump" 2>"$work/restore.err"
set -e
restore_secs=$(( $(date +%s) - restore_start ))
restore_errors=$(grep -c '^pg_restore: error' "$work/restore.err" || true)

tables_sql="select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') order by 1"

count_rows() { # $1 url -> "table count" lines
  local url="$1"
  psql -At "$url" -c "$tables_sql" | while read -r t; do
    printf '%s %s\n' "$t" "$(psql -At "$url" -c "select count(*) from public.\"$t\"")"
  done
}
security() { # $1 url -> "table rls policies" lines
  psql -At -F ' ' "$1" -c "select c.relname, c.relrowsecurity,
    (select count(*) from pg_policy p where p.polrelid = c.oid)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') order by 1"
}

echo "Comparing..."
count_rows "$SUPABASE_DB_URL" >"$work/prod.counts"
count_rows "$local_url" >"$work/local.counts"
security "$SUPABASE_DB_URL" >"$work/prod.security"
security "$local_url" >"$work/local.security"

counts_match=yes
diff -u "$work/prod.counts" "$work/local.counts" >"$work/counts.diff" || counts_match=no
security_match=yes
diff -u "$work/prod.security" "$work/local.security" >"$work/security.diff" || security_match=no

# The console role's column lockout (AD-6) must survive a restore.
console_lockout=no
if psql -At "$local_url" -c "set role console; select transcript from public.notes limit 1" \
  >/dev/null 2>"$work/console.err"; then
  console_lockout=no
elif grep -q 'permission denied' "$work/console.err"; then
  console_lockout=yes
fi

tables=$(wc -l <"$work/prod.counts" | tr -d ' ')
rows=$(awk '{s += $2} END {print s + 0}' "$work/prod.counts")
result=PASS
if [ "$counts_match" != yes ] || [ "$security_match" != yes ] || [ "$console_lockout" != yes ]; then
  result=FAIL
fi

mkdir -p "$(dirname "$report")"
{
  echo "# Restore drill, $started"
  echo
  echo "**Result: $result**"
  echo
  echo "Production dump restored into a throwaway local Postgres $(postgres --version | awk '{print $3}'), then deleted with the cluster. Counts only; no row data in this report."
  echo
  echo "| Check | Result |"
  echo "|---|---|"
  echo "| Dump | $dump_size, ${dump_secs}s (schemas public, auth, pgboss) |"
  echo "| Restore | ${restore_secs}s, $restore_errors statement error(s) (Supabase-only extensions) |"
  echo "| Public tables | $tables |"
  echo "| Rows, production vs restored | $rows rows, match: $counts_match |"
  echo "| RLS switches and policy counts | match: $security_match |"
  echo "| console cannot read notes.transcript | $console_lockout |"
  if [ "$counts_match" != yes ]; then
    echo; echo '```diff'; cat "$work/counts.diff"; echo '```'
  fi
  if [ "$security_match" != yes ]; then
    echo; echo '```diff'; cat "$work/security.diff"; echo '```'
  fi
  if [ "$restore_errors" != 0 ]; then
    echo; echo "Restore errors (first 10):"; echo; echo '```'
    grep '^pg_restore: error' "$work/restore.err" | head -10 | cut -c1-200
    echo '```'
  fi
} >"$report"

echo "$result. Report: $report"
[ "$result" = PASS ]
