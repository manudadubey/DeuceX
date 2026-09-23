import { describe, expect, it, vi } from 'vitest';
import type { ApprovalGateDb, ApprovalRecord } from './gate';
import { ApprovalAlreadyConsumedError } from './errors';
import {
  EntryDeadlinePassedError,
  EntryNotAvailableError,
  EntryNotEnteredError,
  confirmEntry,
  withdrawEntry,
  type EntriesDb,
  type EntryContext,
} from './entries';

// Same shape as receivables.test.ts's own fakeGateDb: a real unique-claim
// check, not a call-count assertion.
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

const POZNAN_CONTEXT: EntryContext = {
  tournamentId: 'poznan',
  tournamentName: 'Challenger Poznań',
  entryDeadline: '2026-09-18',
  costTotal: 1360,
  currency: 'AUD',
  decisionStatus: 'none',
  plannedExpenseId: null,
};

function approvalFor(
  actionType: 'entry_confirm' | 'retract',
  tournamentId: string,
): ApprovalRecord {
  return {
    id: 'approval-1',
    playerId: 'player-1',
    actionType,
    payload: { tournamentId },
  };
}

function fakeEntriesDb(overrides: Partial<EntriesDb> = {}): EntriesDb {
  return {
    async getEntryContext(tournamentId, playerId) {
      return tournamentId === POZNAN_CONTEXT.tournamentId && playerId === 'player-1'
        ? POZNAN_CONTEXT
        : null;
    },
    async insertPlannedLedgerLine() {
      return { id: 'ledger-1' };
    },
    async deletePlannedLedgerLine() {
      /* no-op */
    },
    async setEntryDecisionEntered() {
      /* no-op */
    },
    async setEntryDecisionWithdrawn() {
      /* no-op */
    },
    ...overrides,
  };
}

describe('confirmEntry', () => {
  it("logs the server's own current cost as a planned expense and marks the tournament entered (PRD-01 T-9)", async () => {
    const gateDb = fakeGateDb([approvalFor('entry_confirm', 'poznan')]);
    const insertPlannedLedgerLine = vi.fn().mockResolvedValue({ id: 'ledger-1' });
    const setEntryDecisionEntered = vi.fn().mockResolvedValue(undefined);
    const db = fakeEntriesDb({ insertPlannedLedgerLine, setEntryDecisionEntered });

    const result = await confirmEntry(
      gateDb,
      db,
      { approvalId: 'approval-1', playerId: 'player-1', tournamentId: 'poznan' },
      new Date('2026-09-14T00:00:00Z'),
    );

    expect(result.plannedAmount).toBe(1360);
    expect(result.plannedCurrency).toBe('AUD');
    expect(result.plannedExpenseId).toBe('ledger-1');
    expect(insertPlannedLedgerLine).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1360, currency: 'AUD', tournamentId: 'poznan' }),
    );
    expect(setEntryDecisionEntered).toHaveBeenCalledWith(
      expect.objectContaining({ tournamentId: 'poznan', plannedExpenseId: 'ledger-1' }),
    );
  });

  it('ignores a client-supplied amount entirely — there is none to supply; the amount always comes from the server context', async () => {
    const gateDb = fakeGateDb([approvalFor('entry_confirm', 'poznan')]);
    const db = fakeEntriesDb();
    const result = await confirmEntry(gateDb, db, {
      approvalId: 'approval-1',
      playerId: 'player-1',
      tournamentId: 'poznan',
    });
    expect(result.plannedAmount).toBe(POZNAN_CONTEXT.costTotal);
  });

  it('refuses when the candidate is not found or already decided', async () => {
    const gateDb = fakeGateDb([approvalFor('entry_confirm', 'poznan')]);
    const db = fakeEntriesDb({
      async getEntryContext() {
        return { ...POZNAN_CONTEXT, decisionStatus: 'skipped' };
      },
    });
    await expect(
      confirmEntry(gateDb, db, {
        approvalId: 'approval-1',
        playerId: 'player-1',
        tournamentId: 'poznan',
      }),
    ).rejects.toThrow(EntryNotAvailableError);
  });

  it('refuses a second call for the same approval', async () => {
    const gateDb = fakeGateDb([approvalFor('entry_confirm', 'poznan')]);
    const db = fakeEntriesDb();
    const call = () =>
      confirmEntry(gateDb, db, {
        approvalId: 'approval-1',
        playerId: 'player-1',
        tournamentId: 'poznan',
      });
    await call();
    await expect(call()).rejects.toThrow(ApprovalAlreadyConsumedError);
  });
});

describe('withdrawEntry', () => {
  const enteredContext: EntryContext = {
    ...POZNAN_CONTEXT,
    decisionStatus: 'entered',
    plannedExpenseId: 'ledger-1',
  };

  it('removes the planned expense and marks the tournament withdrawn while before the deadline (PRD-01 T-11)', async () => {
    const gateDb = fakeGateDb([approvalFor('retract', 'poznan')]);
    const deletePlannedLedgerLine = vi.fn().mockResolvedValue(undefined);
    const setEntryDecisionWithdrawn = vi.fn().mockResolvedValue(undefined);
    const db = fakeEntriesDb({
      async getEntryContext() {
        return enteredContext;
      },
      deletePlannedLedgerLine,
      setEntryDecisionWithdrawn,
    });

    await withdrawEntry(
      gateDb,
      db,
      { approvalId: 'approval-1', playerId: 'player-1', tournamentId: 'poznan' },
      new Date('2026-09-14T00:00:00Z'),
    );

    expect(deletePlannedLedgerLine).toHaveBeenCalledWith('ledger-1');
    expect(setEntryDecisionWithdrawn).toHaveBeenCalledWith(
      expect.objectContaining({ tournamentId: 'poznan' }),
    );
  });

  it('refuses when the tournament is not currently Entered', async () => {
    const gateDb = fakeGateDb([approvalFor('retract', 'poznan')]);
    const db = fakeEntriesDb();
    await expect(
      withdrawEntry(gateDb, db, {
        approvalId: 'approval-1',
        playerId: 'player-1',
        tournamentId: 'poznan',
      }),
    ).rejects.toThrow(EntryNotEnteredError);
  });

  it('refuses once the entry deadline has passed, even under a valid, unconsumed approval', async () => {
    const gateDb = fakeGateDb([approvalFor('retract', 'poznan')]);
    const db = fakeEntriesDb({
      async getEntryContext() {
        return enteredContext; // deadline 2026-09-18
      },
    });
    await expect(
      withdrawEntry(
        gateDb,
        db,
        { approvalId: 'approval-1', playerId: 'player-1', tournamentId: 'poznan' },
        new Date('2026-09-19T00:00:00Z'),
      ),
    ).rejects.toThrow(EntryDeadlinePassedError);
  });
});
