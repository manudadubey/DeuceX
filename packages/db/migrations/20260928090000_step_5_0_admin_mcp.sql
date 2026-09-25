-- Step 5.0: the admin MCP server (TECH-ARCHITECTURE.md 3a, PRD-13 AD-3 to AD-5).
--
-- * admin_mcp_tokens: personal tokens a staff member creates from the console
--   (owner decision 26 September 2026) so an MCP client can act as them. The
--   console session that creates one has already passed staff sign-in and, when
--   ADMIN_PASSKEY_REQUIRED is on, the passkey (AD-1); the token carries that
--   identity forward for at most 30 days. Only a SHA-256 hash is stored; the
--   token itself is shown once. A token is dead the moment it is revoked, it
--   expires, or its admin_users row is revoked (apps/api joins on that row on
--   every call), and the role is read live, never baked into the token.
-- * admin_actions.via: 'console' or 'mcp'. The admin audit log shows an MCP
--   call's actor as mcp:<admin name> (build plan step 5.0). Staff-only: the
--   player's own select on admin_actions is a named column list (step 5.1), so
--   the new column is not visible to players.

create table public.admin_mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin_users (id),
  label text not null check (length(trim(label)) between 1 and 80),
  token_hash text not null unique,
  -- The first characters of the token, shown in the console so a staff member
  -- can tell their tokens apart. Not enough to use.
  token_prefix text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint admin_mcp_tokens_expiry check (expires_at > created_at)
);

comment on table public.admin_mcp_tokens is
  'Personal admin MCP tokens (step 5.0). SHA-256 hash only; shown once at creation. Valid while unrevoked, unexpired and the admin_users row is unrevoked.';

create index admin_mcp_tokens_admin_idx on public.admin_mcp_tokens (admin_id, created_at);

alter table public.admin_mcp_tokens enable row level security;
-- Players never reach this table: no policy for them, and no grant either
-- (Supabase's default privileges grant every new table to anon and
-- authenticated, leaving RLS as the only barrier).
revoke all on public.admin_mcp_tokens from anon, authenticated;

grant select, insert on public.admin_mcp_tokens to console;
grant update (last_used_at, revoked_at) on public.admin_mcp_tokens to console;
create policy console_all on public.admin_mcp_tokens for all to console using (true) with check (true);

alter table public.admin_actions
  add column via text not null default 'console' check (via in ('console', 'mcp'));

comment on column public.admin_actions.via is
  'Where the staff action came from: the console, or the admin MCP server (shown as mcp:<admin name>). Staff-only.';
