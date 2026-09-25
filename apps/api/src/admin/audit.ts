import type { AdminActionGateDb, AdminActionRecord } from '@deucex/actions/account';
import { reasonRequired } from '@deucex/actions/account';
import type { ConsoleDb, ConsoleQuery } from './console-db';
import type { Staff } from './staff-auth';

// Every console action writes one admin_actions row (PRD-13 AD-4, AD-AC-14):
// actor admin, the role acted as, the one-sentence consequence shown at
// confirmation, the reason where AD-5 needs one, device and ip. Rows with a
// player_id appear in that player's own Data & safety log. The row is
// written in the same transaction as the state change it records, so a
// failed change leaves no entry and a recorded change always has one.

export class ReasonRequiredError extends Error {
  constructor(readonly actionType: string) {
    super('Write a reason before confirming. It is stored verbatim and shown to the player.');
    this.name = 'ReasonRequiredError';
  }
}

export interface RequestMeta {
  device: string | null;
  ip: string | null;
}

export interface AdminActionInput {
  playerId: string | null;
  actionType: string;
  target?: Record<string, unknown>;
  consequence: string;
  reason?: string | null;
  notifiedPlayer?: boolean;
}

export async function recordAdminAction(
  q: ConsoleQuery,
  staff: Staff,
  meta: RequestMeta,
  input: AdminActionInput,
): Promise<string> {
  const reason = input.reason?.trim() ? input.reason.trim() : null;
  if (reasonRequired(input.actionType) && !reason) throw new ReasonRequiredError(input.actionType);

  const { rows } = await q.query<{ id: string }>(
    `insert into public.admin_actions
       (admin_id, admin_name, role_at_time, player_id, action_type, target, consequence,
        reason, device, ip, notified_player)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning id`,
    [
      staff.id,
      staff.name,
      staff.actingRole,
      input.playerId,
      input.actionType,
      input.target ? JSON.stringify(input.target) : null,
      input.consequence,
      reason,
      meta.device,
      meta.ip,
      input.notifiedPlayer ?? false,
    ],
  );
  return rows[0]!.id;
}

/** A For-you notification to the player (PRD-13 section 9), written as the console role. */
export async function notifyPlayer(
  q: ConsoleQuery,
  input: { playerId: string; title: string; body: string; href?: string | null },
): Promise<void> {
  await q.query(
    `insert into public.notifications (player_id, agent, category, title, body, action_href)
     values ($1, 'deucex', 'for_you', $2, $3, $4)`,
    [input.playerId, input.title, input.body, input.href ?? null],
  );
}

export class ConsoleAdminGateDb implements AdminActionGateDb {
  constructor(private readonly db: ConsoleDb) {}

  getAdminAction(adminActionId: string): Promise<AdminActionRecord | null> {
    return this.db.tx(async (q) => {
      const { rows } = await q.query<{
        id: string;
        admin_id: string;
        player_id: string | null;
        action_type: string;
        reason: string | null;
      }>(
        `select id, admin_id, player_id, action_type, reason from public.admin_actions where id = $1`,
        [adminActionId],
      );
      const row = rows[0];
      return row
        ? {
            id: row.id,
            adminId: row.admin_id,
            playerId: row.player_id,
            actionType: row.action_type,
            reason: row.reason,
          }
        : null;
    });
  }

  claimAdminAction(adminActionId: string): Promise<boolean> {
    return this.db.tx(async (q) => {
      const { rowCount } = await q.query(
        `insert into public.admin_action_consumptions (admin_action_id) values ($1)
         on conflict (admin_action_id) do nothing`,
        [adminActionId],
      );
      return rowCount === 1;
    });
  }
}
