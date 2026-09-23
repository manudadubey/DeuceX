import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Hand-maintained union for share_links.scope's check constraint (step 0.2),
// the same idiom every other domain module uses.
export type ShareScope = 'coach' | 'manager';
export type ShareLink = Database['public']['Tables']['share_links']['Row'];

const SHARE_LINK_LIFETIME_DAYS = 90;

function randomToken(): string {
  // 128-bit random, hex-encoded to 32 chars (TECH-ARCHITECTURE.md 2.2's own
  // spec for share_links.token). crypto.getRandomValues is available in
  // both the browser (this runs client-side, plain RLS write, no vendor
  // call) and Node's Web Crypto global.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CreateShareLinkInput {
  playerId: string;
  scope: ShareScope;
}

// Sharing pane's "create another link" (PRD-12 4.9): a plain RLS-scoped
// insert, same as expense_save/balance_update — creating a link has no
// vendor side effect, only *opening* one does (bumping open_count via
// apps/api's service-role route, since a visitor has no RLS session).
export async function createShareLink(
  client: SupabaseClient<Database>,
  input: CreateShareLinkInput,
): Promise<ShareLink> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SHARE_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  const { data, error } = await client
    .from('share_links')
    .insert({
      player_id: input.playerId,
      scope: input.scope,
      token: randomToken(),
      expires_at: expiresAt.toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listShareLinks(
  client: SupabaseClient<Database>,
  playerId: string,
): Promise<ShareLink[]> {
  const { data, error } = await client
    .from('share_links')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ST-15/M-SHARE-3: revoking must be reflected within a minute. This flips
// the flag directly; apps/api's GET /sharing/:token route checks it on
// every open with no caching, so the very next request after this write
// already fails — well inside the one-minute requirement.
export async function revokeShareLink(
  client: SupabaseClient<Database>,
  linkId: string,
): Promise<void> {
  const { error } = await client.from('share_links').update({ revoked: true }).eq('id', linkId);
  if (error) throw error;
}

// ST-16 / decisions worksheet 12: resets the 90-day window from now.
export async function renewShareLink(
  client: SupabaseClient<Database>,
  linkId: string,
): Promise<ShareLink> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SHARE_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  const { data, error } = await client
    .from('share_links')
    .update({ renewed_at: now.toISOString(), expires_at: expiresAt.toISOString() })
    .eq('id', linkId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
