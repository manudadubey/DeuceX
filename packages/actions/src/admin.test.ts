import { describe, expect, it, vi } from 'vitest';
import {
  AdminActionAlreadyConsumedError,
  AdminActionMismatchError,
  AdminActionNotFoundError,
  AdminReasonRequiredError,
  type AdminActionGateDb,
  type AdminActionRecord,
  runAdminGatedAction,
  sendPlayerSignInLink,
  sendStaffDeletionStartedEmail,
} from './admin';
import { sendStaffDataExport, type DataExportDb } from './account';
import type { EmailClient } from './resend-client';

// In-memory admin_actions + admin_action_consumptions: the claim mirrors the
// real primary key, so a second claim of the same id returns false.
function fakeDb(actions: AdminActionRecord[]) {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const claimed = new Set<string>();
  const db: AdminActionGateDb = {
    async getAdminAction(id) {
      return byId.get(id) ?? null;
    },
    async claimAdminAction(id) {
      if (claimed.has(id)) return false;
      claimed.add(id);
      return true;
    },
  };
  return { db, claimed };
}

function fakeEmail() {
  const sendEmail = vi.fn(async () => ({ id: 'email-1' }));
  return { client: { sendEmail } as unknown as EmailClient, sendEmail };
}

const DELETE: AdminActionRecord = {
  id: 'aa-1',
  adminId: 'admin-1',
  playerId: 'player-1',
  actionType: 'delete_account',
  reason: 'Player asked by email on 26 September',
};

describe('runAdminGatedAction', () => {
  it('refuses and never runs the side effect when no admin action is on record', async () => {
    const { db } = fakeDb([]);
    const sideEffect = vi.fn();
    await expect(
      runAdminGatedAction(
        db,
        { adminActionId: 'nope', playerId: 'player-1', actionType: 'delete_account' },
        sideEffect,
      ),
    ).rejects.toThrow(AdminActionNotFoundError);
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('refuses an action recorded for a different player or type', async () => {
    const { db } = fakeDb([DELETE]);
    const sideEffect = vi.fn();
    await expect(
      runAdminGatedAction(
        db,
        { adminActionId: 'aa-1', playerId: 'player-2', actionType: 'delete_account' },
        sideEffect,
      ),
    ).rejects.toThrow(AdminActionMismatchError);
    await expect(
      runAdminGatedAction(
        db,
        { adminActionId: 'aa-1', playerId: 'player-1', actionType: 'magic_link' },
        sideEffect,
      ),
    ).rejects.toThrow(AdminActionMismatchError);
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('refuses an AD-5 action whose record has no reason', async () => {
    const { db } = fakeDb([{ ...DELETE, reason: '  ' }]);
    const sideEffect = vi.fn();
    await expect(
      runAdminGatedAction(
        db,
        { adminActionId: 'aa-1', playerId: 'player-1', actionType: 'delete_account' },
        sideEffect,
      ),
    ).rejects.toThrow(AdminReasonRequiredError);
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('runs once, then refuses a replay of the same action', async () => {
    const { db } = fakeDb([DELETE]);
    const sideEffect = vi.fn(async () => 'ok');
    const input = { adminActionId: 'aa-1', playerId: 'player-1', actionType: 'delete_account' };
    await expect(runAdminGatedAction(db, input, sideEffect)).resolves.toBe('ok');
    await expect(runAdminGatedAction(db, input, sideEffect)).rejects.toThrow(
      AdminActionAlreadyConsumedError,
    );
    expect(sideEffect).toHaveBeenCalledTimes(1);
  });
});

describe('staff-triggered player emails', () => {
  it('sends the deletion email only behind a matching delete_account action', async () => {
    const { db } = fakeDb([DELETE]);
    const { client, sendEmail } = fakeEmail();
    const input = {
      adminActionId: 'aa-1',
      playerId: 'player-1',
      playerEmail: 'player@example.test',
      effectiveAt: '2026-10-11T09:00:00.000Z',
      appBaseUrl: 'https://deucex.vercel.app',
    };
    await sendStaffDeletionStartedEmail(db, client, input);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]).toMatchObject([
      { to: 'player@example.test', subject: expect.stringContaining('scheduled for deletion') },
    ]);

    const { client: other, sendEmail: otherSend } = fakeEmail();
    await expect(sendStaffDeletionStartedEmail(fakeDb([]).db, other, input)).rejects.toThrow(
      AdminActionNotFoundError,
    );
    expect(otherSend).not.toHaveBeenCalled();
  });

  it('refuses a sign-in link sent under a different action type', async () => {
    const { db } = fakeDb([DELETE]);
    const { client, sendEmail } = fakeEmail();
    await expect(
      sendPlayerSignInLink(db, client, {
        adminActionId: 'aa-1',
        playerId: 'player-1',
        playerEmail: 'player@example.test',
        signInUrl: 'https://deucex.vercel.app/auth/confirm?token_hash=x&type=magiclink',
      }),
    ).rejects.toThrow(AdminActionMismatchError);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('never builds or sends an export without an export_data action', async () => {
    const { client, sendEmail } = fakeEmail();
    const exportDb = {
      getPlayerEmail: vi.fn(async () => 'player@example.test'),
      getExportBundle: vi.fn(),
      storeExportRequest: vi.fn(),
      storeDeletionRequest: vi.fn(),
    } as unknown as DataExportDb;
    await expect(
      sendStaffDataExport(fakeDb([]).db, client, exportDb, {
        adminActionId: 'nope',
        playerId: 'player-1',
      }),
    ).rejects.toThrow(AdminActionNotFoundError);
    expect(exportDb.getExportBundle).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
