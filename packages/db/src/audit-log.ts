import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// The player's own audit log (PRD-12 section 4.10, PRD-13 AD-4): their
// approvals and every staff action on their account, newest first, staff
// rows marked as admin with a name and role (never contact details; the
// step 5.1 migration withholds device and ip from the player's grant).
// Both reads are RLS-scoped to the signed-in player.

export interface AuditLogEntry {
  id: string;
  at: string;
  actor: 'you' | 'admin';
  action: string;
  adminName: string | null;
  adminRole: string | null;
  consequence: string | null;
  reason: string | null;
}

export async function listAuditLog(
  client: SupabaseClient<Database>,
  playerId: string,
  limit = 50,
): Promise<AuditLogEntry[]> {
  const [approvals, admin] = await Promise.all([
    client
      .from('approvals')
      .select('id, action_type, approved_at')
      .eq('player_id', playerId)
      .order('approved_at', { ascending: false })
      .limit(limit),
    client
      .from('admin_actions')
      .select('id, action_type, consequence, reason, role_at_time, admin_name, created_at')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);
  if (approvals.error) throw approvals.error;
  if (admin.error) throw admin.error;

  return [
    ...(approvals.data ?? []).map((a): AuditLogEntry => ({
      id: a.id,
      at: a.approved_at,
      actor: 'you',
      action: a.action_type,
      adminName: null,
      adminRole: null,
      consequence: null,
      reason: null,
    })),
    ...(admin.data ?? []).map((a): AuditLogEntry => ({
      id: a.id,
      at: a.created_at,
      actor: 'admin',
      action: a.action_type,
      adminName: a.admin_name,
      adminRole: a.role_at_time,
      consequence: a.consequence,
      reason: a.reason,
    })),
  ]
    .sort((x, y) => y.at.localeCompare(x.at))
    .slice(0, limit);
}
