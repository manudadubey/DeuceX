import { describe, expect, it, vi } from 'vitest';
import type { ApprovalGateDb, ApprovalRecord } from './gate';
import {
  MissingReceivedDateRateError,
  ReceivableNotFoundOrAlreadyReceivedError,
  type PendingReceivable,
  type ReceivablesDb,
  markReceivableReceived,
} from './receivables';
import { ApprovalAlreadyConsumedError } from './errors';

// Same shape as gate.test.ts's own fakeDb: a real unique-claim check, so a
// second call for the same approval genuinely fails rather than just
// asserting a mock was called.
function fakeGateDb(approvals: ApprovalRecord[]) {
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
  return db;
}

const GENOA_Q2: PendingReceivable = {
  id: 'receivable-1',
  playerId: 'player-1',
  grossAmount: 1780,
  playerShare: 1,
  withholdingAmount: 160,
  currency: 'EUR',
};

function approvalFor(
  receivable: PendingReceivable,
  receivedDate: string,
  realisedHomeCurrency: string,
): ApprovalRecord {
  return {
    id: 'approval-1',
    playerId: receivable.playerId,
    actionType: 'receivable_received',
    payload: { receivableId: receivable.id, receivedDate, realisedHomeCurrency },
  };
}

function fakeReceivablesDb(overrides: Partial<ReceivablesDb> = {}): ReceivablesDb {
  return {
    async getPendingReceivable(receivableId, playerId) {
      return receivableId === GENOA_Q2.id && playerId === GENOA_Q2.playerId ? GENOA_Q2 : null;
    },
    async getFxRateToEur(_date, currency) {
      // ECB convention: units of currency per 1 EUR.
      if (currency === 'AUD') return 1.651;
      return null;
    },
    async getLatestReserveBalance() {
      return 9450;
    },
    async applyReceivedTransition(input) {
      return { reserveEntryId: `reserve-for-${input.receivableId}` };
    },
    ...overrides,
  };
}

describe('markReceivableReceived', () => {
  it('realises the player net share (gross x share − withholding) at the received-date rate and adds it onto the latest reserve balance', async () => {
    const gateDb = fakeGateDb([approvalFor(GENOA_Q2, '2026-10-03', 'AUD')]);
    const applyReceivedTransition = vi.fn().mockResolvedValue({ reserveEntryId: 'reserve-1' });
    const db = fakeReceivablesDb({ applyReceivedTransition });

    const result = await markReceivableReceived(gateDb, db, {
      approvalId: 'approval-1',
      playerId: 'player-1',
      receivableId: 'receivable-1',
      receivedDate: '2026-10-03',
      realisedHomeCurrency: 'AUD',
    });

    // net EUR = 1780 - 160 = 1620; AUD = 1620 * 1.651 = 2674.62
    expect(result.realisedAmountHome).toBeCloseTo(2674.62, 2);
    expect(result.newReserveBalance).toBeCloseTo(9450 + 2674.62, 2);
    expect(applyReceivedTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        receivableId: 'receivable-1',
        receivedAt: '2026-10-03',
        reserveEntry: expect.objectContaining({
          previousAmount: 9450,
          currency: 'AUD',
        }),
      }),
    );
  });

  it('throws and never applies the transition when the receivable does not exist, belongs to someone else, or is already received', async () => {
    const gateDb = fakeGateDb([approvalFor(GENOA_Q2, '2026-10-03', 'AUD')]);
    const applyReceivedTransition = vi.fn();
    const db = fakeReceivablesDb({
      applyReceivedTransition,
      async getPendingReceivable() {
        return null; // not found, or status was already 'received'
      },
    });

    await expect(
      markReceivableReceived(gateDb, db, {
        approvalId: 'approval-1',
        playerId: 'player-1',
        receivableId: 'receivable-1',
        receivedDate: '2026-10-03',
        realisedHomeCurrency: 'AUD',
      }),
    ).rejects.toThrow(ReceivableNotFoundOrAlreadyReceivedError);
    expect(applyReceivedTransition).not.toHaveBeenCalled();
  });

  it('throws MissingReceivedDateRateError rather than guessing when the archive has no rate for that date yet', async () => {
    const gateDb = fakeGateDb([approvalFor(GENOA_Q2, '2026-10-03', 'USD')]);
    const applyReceivedTransition = vi.fn();
    const db = fakeReceivablesDb({ applyReceivedTransition });

    await expect(
      markReceivableReceived(gateDb, db, {
        approvalId: 'approval-1',
        playerId: 'player-1',
        receivableId: 'receivable-1',
        receivedDate: '2026-10-03',
        realisedHomeCurrency: 'USD', // fakeReceivablesDb only knows AUD
      }),
    ).rejects.toThrow(MissingReceivedDateRateError);
    expect(applyReceivedTransition).not.toHaveBeenCalled();
  });

  it('refuses a second call for the same approval (a receivable cannot be marked received twice under one approval)', async () => {
    const gateDb = fakeGateDb([approvalFor(GENOA_Q2, '2026-10-03', 'AUD')]);
    const db = fakeReceivablesDb();
    const call = () =>
      markReceivableReceived(gateDb, db, {
        approvalId: 'approval-1',
        playerId: 'player-1',
        receivableId: 'receivable-1',
        receivedDate: '2026-10-03',
        realisedHomeCurrency: 'AUD',
      });

    await call();
    await expect(call()).rejects.toThrow(ApprovalAlreadyConsumedError);
  });
});
