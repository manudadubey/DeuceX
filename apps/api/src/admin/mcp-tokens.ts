import { createHash, randomBytes } from 'node:crypto';
import type { AdminRole } from '@deucex/shared';
import { recordAdminAction, type RequestMeta } from './audit';
import { formatDay } from './consequences';
import type { ConsoleDb, ConsoleQuery } from './console-db';
import type { Staff } from './staff-auth';

// Personal admin MCP tokens (step 5.0; owner decision 26 September 2026).
// A staff member signed into the console creates one, and an MCP client
// sends it as a bearer token to apps/api's /mcp. Creating one needs a full
// console session (staff sign-in and, when required, the passkey, AD-1), so
// the token only ever carries forward an identity that already passed those
// checks. Only its SHA-256 hash is stored and the token is shown once. It
// stops working the moment it is revoked, it expires, or the staff member's
// own admin_users row is revoked, because every MCP call re-reads that row.
// The role is read live on every call too, never baked into the token.

export const MCP_TOKEN_PREFIX = 'dxm_';
export const MCP_TOKEN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export class McpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpAuthError';
  }
}

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateMcpToken(): string {
  return `${MCP_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export interface McpTokenSummary {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export async function listMcpTokens(q: ConsoleQuery, adminId: string): Promise<McpTokenSummary[]> {
  const { rows } = await q.query<{
    id: string;
    label: string;
    token_prefix: string;
    created_at: string;
    expires_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
  }>(
    `select id, label, token_prefix, created_at, expires_at, last_used_at, revoked_at
     from public.admin_mcp_tokens where admin_id = $1 order by created_at desc limit 50`,
    [adminId],
  );
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    prefix: r.token_prefix,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
  }));
}

export async function createMcpToken(
  db: ConsoleDb,
  staff: Staff,
  meta: RequestMeta,
  label: string,
  now: Date,
): Promise<{ token: string; id: string; expiresAt: string; consequence: string }> {
  const name = label.trim();
  if (!name || name.length > 80) throw new McpAuthError('Name the token in 1 to 80 characters.');
  const token = generateMcpToken();
  const expiresAt = new Date(now.getTime() + MCP_TOKEN_DAYS * DAY_MS);
  const consequence = `Creates the MCP token "${name}" for ${staff.name}, valid until ${formatDay(expiresAt)}. Any MCP client holding it acts as ${staff.name} with their current role, and every call it makes is logged. Revocable at any time.`;
  const id = await db.tx(async (q) => {
    const { rows } = await q.query<{ id: string }>(
      `insert into public.admin_mcp_tokens (admin_id, label, token_hash, token_prefix, created_at, expires_at)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        staff.id,
        name,
        hashMcpToken(token),
        token.slice(0, MCP_TOKEN_PREFIX.length + 6),
        now.toISOString(),
        expiresAt.toISOString(),
      ],
    );
    const tokenId = rows[0]!.id;
    await recordAdminAction(q, staff, meta, {
      playerId: null,
      actionType: 'mcp_token_create',
      target: { tokenId, label: name },
      consequence,
    });
    return tokenId;
  });
  return { token, id, expiresAt: expiresAt.toISOString(), consequence };
}

export async function revokeMcpToken(
  db: ConsoleDb,
  staff: Staff,
  meta: RequestMeta,
  tokenId: string,
): Promise<{ consequence: string }> {
  return db.tx(async (q) => {
    const { rows } = await q.query<{ label: string }>(
      `update public.admin_mcp_tokens set revoked_at = now()
       where id = $1 and admin_id = $2 and revoked_at is null returning label`,
      [tokenId, staff.id],
    );
    if (!rows[0]) throw new McpAuthError('No such active token of yours.');
    const consequence = `Revokes the MCP token "${rows[0].label}" now: any client using it is refused from its next call.`;
    await recordAdminAction(q, staff, meta, {
      playerId: null,
      actionType: 'mcp_token_revoke',
      target: { tokenId },
      consequence,
    });
    return { consequence };
  });
}

const BEARER = /^Bearer (.+)$/;

/**
 * The staff member an MCP bearer token acts for, or McpAuthError. One
 * statement: the token must be unrevoked and unexpired and its staff row
 * unrevoked; last_used_at is stamped on the way.
 */
export async function authenticateMcpToken(
  db: ConsoleDb,
  authorization: string | undefined,
): Promise<Staff & { tokenId: string }> {
  const token = authorization?.match(BEARER)?.[1]?.trim();
  if (!token || !token.startsWith(MCP_TOKEN_PREFIX)) {
    throw new McpAuthError(
      'Send a DeuceX admin MCP token as a bearer token. Create one in the console user menu, MCP access.',
    );
  }
  const row = await db.tx(async (q) => {
    const { rows } = await q.query<{
      token_id: string;
      id: string;
      name: string;
      email: string;
      role: AdminRole;
    }>(
      `update public.admin_mcp_tokens t set last_used_at = now()
       from public.admin_users u
       where t.token_hash = $1 and t.revoked_at is null and t.expires_at > now()
         and u.id = t.admin_id and u.revoked_at is null
       returning t.id as token_id, u.id, u.name, u.email, u.role`,
      [hashMcpToken(token)],
    );
    return rows[0] ?? null;
  });
  if (!row) {
    throw new McpAuthError(
      'This MCP token is not valid: it was revoked, it expired, or its console access ended.',
    );
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    // No role preview over MCP: the token acts with the role actually held.
    actingRole: row.role,
    via: 'mcp',
    tokenId: row.token_id,
  };
}
