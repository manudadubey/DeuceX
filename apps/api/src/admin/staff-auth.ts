import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { effectiveRole, type AdminRole } from '@deucex/shared';
import type { ConsoleDb } from './console-db';

// Staff sign-in (PRD-13 AD-1, decisions worksheet 11): magic link plus a
// mandatory passkey. The magic link only ever starts a session; the console
// API then refuses everything until the staff member has registered a
// passkey (`passkey_enrolment_required`), and after that refuses any
// session that was not itself opened with that passkey
// (`passkey_sign_in_required`). So a stolen inbox alone never reaches the
// console. The Supabase session is verified the same way apps/api verifies
// a player's (auth.ts); what makes it staff is an unrevoked admin_users row
// read through the console role.

export class StaffAuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code:
      | 'unauthenticated'
      | 'not_staff'
      | 'passkey_enrolment_required'
      | 'passkey_sign_in_required'
      | 'forbidden_area',
    message: string,
  ) {
    super(message);
    this.name = 'StaffAuthError';
  }
}

export interface Staff {
  id: string;
  name: string;
  email: string;
  /** The role actually held. */
  role: AdminRole;
  /** The role this request acts as (narrowed by the role preview, never widened). */
  actingRole: AdminRole;
}

export interface StaffAuthDeps {
  anonClient: SupabaseClient<Database>;
  /** Service-role client with auth.experimental.passkey on, for the admin passkey list. */
  passkeyAdmin: SupabaseClient<Database>;
  consoleDb: ConsoleDb;
  /**
   * AD-1's mandatory passkey. Owner decision, 25 September 2026: off for
   * local development until launch (a registration mix-up on the owner's
   * device made it unusable), back on before launch. index.ts refuses to
   * start with it off when NODE_ENV is production.
   */
  requirePasskey: boolean;
}

const BEARER = /^Bearer (.+)$/;

// Supabase records the sign-in method in the access token's amr claim.
// Magic link and OTP are the only non-passkey methods staff can reach.
const NON_PASSKEY_METHODS = new Set(['otp', 'magiclink', 'email', 'password']);

function decodeAmr(token: string): string[] {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    const amr = Array.isArray(payload.amr) ? payload.amr : [];
    return amr.map((entry: unknown) =>
      typeof entry === 'string'
        ? entry
        : String((entry as { method?: unknown } | null)?.method ?? ''),
    );
  } catch {
    return [];
  }
}

export function sessionUsedPasskey(token: string): boolean {
  const methods = decodeAmr(token).filter(Boolean);
  return methods.some((m) => !NON_PASSKEY_METHODS.has(m));
}

export async function countPasskeys(
  passkeyAdmin: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  const { data, error } = await passkeyAdmin.auth.admin.passkey.listPasskeys({ userId });
  if (error) throw error;
  return data?.length ?? 0;
}

export interface AuthenticateOptions {
  /** The enrolment endpoints accept a session that has no passkey yet. */
  allowWithoutPasskey?: boolean;
}

export async function authenticateStaff(
  deps: StaffAuthDeps,
  headers: { authorization?: string | undefined; 'x-role-preview'?: string | string[] | undefined },
  options: AuthenticateOptions = {},
): Promise<Staff & { passkeys: number; token: string }> {
  const token = headers.authorization?.match(BEARER)?.[1];
  if (!token) throw new StaffAuthError(401, 'unauthenticated', 'Sign in to use the console.');

  const { data, error } = await deps.anonClient.auth.getUser(token);
  if (error || !data.user) {
    throw new StaffAuthError(401, 'unauthenticated', 'Your session has expired. Sign in again.');
  }

  const row = await deps.consoleDb.tx(async (q) => {
    const result = await q.query<{ id: string; name: string; email: string; role: AdminRole }>(
      `select id, name, email, role from public.admin_users where id = $1 and revoked_at is null`,
      [data.user.id],
    );
    return result.rows[0] ?? null;
  });
  if (!row) throw new StaffAuthError(403, 'not_staff', 'This account has no console access.');

  const passkeys = await countPasskeys(deps.passkeyAdmin, row.id);
  if (deps.requirePasskey && !options.allowWithoutPasskey) {
    if (passkeys === 0) {
      throw new StaffAuthError(
        403,
        'passkey_enrolment_required',
        'Register a passkey before using the console.',
      );
    }
    if (!sessionUsedPasskey(token)) {
      throw new StaffAuthError(
        403,
        'passkey_sign_in_required',
        'Confirm it is you with your passkey to continue.',
      );
    }
  }

  const preview = headers['x-role-preview'];
  return {
    ...row,
    actingRole: effectiveRole(row.role, Array.isArray(preview) ? preview[0] : preview),
    passkeys,
    token,
  };
}
