import { describe, expect, it, vi } from 'vitest';
import {
  ApprovalActionMismatchError,
  ApprovalAlreadyConsumedError,
  ApprovalNotFoundError,
  ApprovalPayloadMismatchError,
} from './errors';
import { type ApprovalGateDb, type ApprovalRecord, runGatedAction } from './gate';

// An in-memory ApprovalGateDb standing in for approvals + approval_consumptions.
// claimApproval mirrors the real migration's behaviour: a unique primary key
// on approval_id, so the second claim for the same id returns false instead
// of throwing — exactly what makes the gate race-safe.
function fakeDb(approvals: ApprovalRecord[]) {
  const byId = new Map(approvals.map((a) => [a.id, a]));
  const claimed = new Set<string>();
  const db: ApprovalGateDb = {
    async getApproval(approvalId, playerId) {
      const approval = byId.get(approvalId);
      return approval && approval.playerId === playerId ? approval : null;
    },
    async claimApproval({ approvalId }) {
      if (claimed.has(approvalId)) return false;
      claimed.add(approvalId);
      return true;
    },
  };
  return { db, claimed };
}

const APPROVAL: ApprovalRecord = {
  id: 'approval-1',
  playerId: 'player-1',
  actionType: 'expense_save',
  payload: { amount: 1360, currency: 'AUD' },
};

describe('runGatedAction', () => {
  it('throws ApprovalNotFoundError and never runs the side effect when the approval does not exist', async () => {
    const { db } = fakeDb([]);
    const sideEffect = vi.fn();

    await expect(
      runGatedAction(
        db,
        { approvalId: 'nope', playerId: 'player-1', actionType: 'expense_save', payload: {} },
        sideEffect,
      ),
    ).rejects.toThrow(ApprovalNotFoundError);
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('throws ApprovalNotFoundError (not a different error) when the approval belongs to another player', async () => {
    const { db } = fakeDb([APPROVAL]);
    const sideEffect = vi.fn();

    await expect(
      runGatedAction(
        db,
        {
          approvalId: APPROVAL.id,
          playerId: 'someone-else',
          actionType: 'expense_save',
          payload: APPROVAL.payload,
        },
        sideEffect,
      ),
    ).rejects.toThrow(ApprovalNotFoundError);
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('throws ApprovalActionMismatchError when called for a different action than was approved', async () => {
    const { db } = fakeDb([APPROVAL]);
    const sideEffect = vi.fn();

    await expect(
      runGatedAction(
        db,
        {
          approvalId: APPROVAL.id,
          playerId: APPROVAL.playerId,
          actionType: 'entry_confirm',
          payload: APPROVAL.payload,
        },
        sideEffect,
      ),
    ).rejects.toThrow(ApprovalActionMismatchError);
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('throws ApprovalPayloadMismatchError when the payload does not match what was approved', async () => {
    const { db } = fakeDb([APPROVAL]);
    const sideEffect = vi.fn();

    await expect(
      runGatedAction(
        db,
        {
          approvalId: APPROVAL.id,
          playerId: APPROVAL.playerId,
          actionType: APPROVAL.actionType as never,
          payload: { amount: 9999, currency: 'AUD' },
        },
        sideEffect,
      ),
    ).rejects.toThrow(ApprovalPayloadMismatchError);
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('claims the approval and runs the side effect exactly once on a valid approval', async () => {
    const { db, claimed } = fakeDb([APPROVAL]);
    const sideEffect = vi.fn().mockResolvedValue('vendor-call-result');

    const result = await runGatedAction(
      db,
      {
        approvalId: APPROVAL.id,
        playerId: APPROVAL.playerId,
        actionType: APPROVAL.actionType as never,
        payload: APPROVAL.payload,
      },
      sideEffect,
    );

    expect(result).toBe('vendor-call-result');
    expect(sideEffect).toHaveBeenCalledTimes(1);
    expect(claimed.has(APPROVAL.id)).toBe(true);
  });

  it('refuses a second call for the same approval and never runs the side effect again', async () => {
    const { db } = fakeDb([APPROVAL]);
    const sideEffect = vi.fn().mockResolvedValue('ok');
    const call = () =>
      runGatedAction(
        db,
        {
          approvalId: APPROVAL.id,
          playerId: APPROVAL.playerId,
          actionType: APPROVAL.actionType as never,
          payload: APPROVAL.payload,
        },
        sideEffect,
      );

    await call();
    await expect(call()).rejects.toThrow(ApprovalAlreadyConsumedError);
    expect(sideEffect).toHaveBeenCalledTimes(1);
  });
});
