import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';

// apps/api never trusts a client-supplied player id (unlike the direct
// client-side writes in apps/web, where RLS is the real authorization —
// see packages/db/src/notes.ts). Every note route here has a genuine vendor
// side effect (R2, Whisper) on the service-role client, which bypasses RLS
// entirely, so the player id has to come from verifying the caller's own
// Supabase session token instead.
export class UnauthorizedError extends Error {}

const BEARER_PREFIX = /^Bearer (.+)$/;

export async function authenticateRequest(
  anonClient: SupabaseClient<Database>,
  authorizationHeader: string | undefined,
): Promise<string> {
  const token = authorizationHeader?.match(BEARER_PREFIX)?.[1];
  if (!token) throw new UnauthorizedError('Missing bearer token');

  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data.user) throw new UnauthorizedError('Invalid or expired session');
  return data.user.id;
}
