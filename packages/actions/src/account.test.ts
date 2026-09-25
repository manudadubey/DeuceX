import { describe, expect, it, vi } from 'vitest';
import type { ApprovalGateDb, ApprovalRecord } from './gate';
import { ApprovalAlreadyConsumedError } from './errors';
import type { EmailClient } from './resend-client';
import {
  MissingPlayerEmailError,
  buildExpensesCsv,
  buildNotesCsv,
  buildTranscriptsText,
  cancelAccountDeletion,
  confirmAccountDeletion,
  requestAccountDeletion,
  requestDataExport,
  type AccountDb,
  type AccountDeletionDb,
  type DataExportDb,
  type ExportBundle,
} from './account';

// Same shape as receivables.test.ts's own fakeGateDb: a real unique-claim
// check, so a second call for the same approval genuinely fails rather
// than just asserting a mock was called.
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

function deletionApproval(playerId: string): ApprovalRecord {
  return { id: 'approval-1', playerId, actionType: 'account_deletion_request', payload: {} };
}

function exportApproval(playerId: string): ApprovalRecord {
  return { id: 'approval-1', playerId, actionType: 'data_export_request', payload: {} };
}

function fakeEmailClient(): EmailClient & { sent: Array<Parameters<EmailClient['sendEmail']>[0]> } {
  const sent: Array<Parameters<EmailClient['sendEmail']>[0]> = [];
  return {
    sent,
    async sendEmail(input) {
      sent.push(input);
    },
  };
}

describe('requestAccountDeletion', () => {
  it('emails a confirm link and stores the token, without setting deletion_effective_at', async () => {
    const gateDb = fakeGateDb([deletionApproval('player-1')]);
    const email = fakeEmailClient();
    const storeDeletionRequest = vi.fn().mockResolvedValue(undefined);
    const db: AccountDeletionDb = {
      async getPlayerEmail() {
        return 'arya@example.com';
      },
      storeDeletionRequest,
    };

    const { token } = await requestAccountDeletion(gateDb, email, db, {
      approvalId: 'approval-1',
      playerId: 'player-1',
      appBaseUrl: 'https://app.deucex.ai',
    });

    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(storeDeletionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'player-1', token }),
    );
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.to).toBe('arya@example.com');
    expect(email.sent[0]?.html).toContain(token);
  });

  it('throws without emailing when the player has no email on file', async () => {
    const gateDb = fakeGateDb([deletionApproval('player-1')]);
    const email = fakeEmailClient();
    const db: AccountDeletionDb = {
      async getPlayerEmail() {
        return null;
      },
      storeDeletionRequest: vi.fn(),
    };

    await expect(
      requestAccountDeletion(gateDb, email, db, {
        approvalId: 'approval-1',
        playerId: 'player-1',
        appBaseUrl: 'https://app.deucex.ai',
      }),
    ).rejects.toThrow(MissingPlayerEmailError);
    expect(email.sent).toHaveLength(0);
  });

  it('refuses a second call for the same approval', async () => {
    const gateDb = fakeGateDb([deletionApproval('player-1')]);
    const email = fakeEmailClient();
    const db: AccountDeletionDb = {
      async getPlayerEmail() {
        return 'arya@example.com';
      },
      storeDeletionRequest: vi.fn(),
    };
    const call = () =>
      requestAccountDeletion(gateDb, email, db, {
        approvalId: 'approval-1',
        playerId: 'player-1',
        appBaseUrl: 'https://app.deucex.ai',
      });

    await call();
    await expect(call()).rejects.toThrow(ApprovalAlreadyConsumedError);
  });

  it('throws ApprovalNotFoundError-family errors for a player who does not own the approval', async () => {
    const gateDb = fakeGateDb([deletionApproval('someone-else')]);
    const email = fakeEmailClient();
    const db: AccountDeletionDb = {
      async getPlayerEmail() {
        return 'arya@example.com';
      },
      storeDeletionRequest: vi.fn(),
    };

    await expect(
      requestAccountDeletion(gateDb, email, db, {
        approvalId: 'approval-1',
        playerId: 'player-1',
        appBaseUrl: 'https://app.deucex.ai',
      }),
    ).rejects.toThrow();
  });
});

describe('confirmAccountDeletion / cancelAccountDeletion', () => {
  it('sets effective_at fourteen days out and clears the token', async () => {
    const confirmDeletion = vi.fn().mockResolvedValue(undefined);
    const db: AccountDb = {
      async findPlayerByDeletionToken(token) {
        return token === 'tok-1' ? { playerId: 'player-1' } : null;
      },
      confirmDeletion,
      cancelDeletion: vi.fn(),
    };

    const result = await confirmAccountDeletion(db, 'tok-1', new Date('2026-09-23T00:00:00Z'));

    expect(result).toEqual({ playerId: 'player-1', effectiveAt: '2026-10-07T00:00:00.000Z' });
    expect(confirmDeletion).toHaveBeenCalledWith({
      playerId: 'player-1',
      effectiveAt: '2026-10-07T00:00:00.000Z',
    });
  });

  it('returns null for an unknown token, without writing anything', async () => {
    const confirmDeletion = vi.fn();
    const db: AccountDb = {
      async findPlayerByDeletionToken() {
        return null;
      },
      confirmDeletion,
      cancelDeletion: vi.fn(),
    };

    const result = await confirmAccountDeletion(db, 'unknown-token');

    expect(result).toBeNull();
    expect(confirmDeletion).not.toHaveBeenCalled();
  });

  it('cancelAccountDeletion delegates straight through', async () => {
    const cancelDeletion = vi.fn().mockResolvedValue(undefined);
    const db: AccountDb = {
      findPlayerByDeletionToken: vi.fn(),
      confirmDeletion: vi.fn(),
      cancelDeletion,
    };

    await cancelAccountDeletion(db, 'player-1');

    expect(cancelDeletion).toHaveBeenCalledWith('player-1');
  });
});

const SAMPLE_BUNDLE: ExportBundle = {
  notes: [
    {
      recordedAt: '2026-09-20T10:00:00Z',
      ctx: 'match',
      result: 'W 6-4 6-3',
      opponent: 'Kovalenko',
      tags: ['second_serve'],
      mood: 'confident',
      summary: 'Solid from the back.',
      transcript: 'Felt good on the second serve today.',
    },
    {
      recordedAt: '2026-09-18T10:00:00Z',
      ctx: 'practice',
      result: null,
      opponent: null,
      tags: [],
      mood: null,
      summary: null,
      transcript: null,
    },
  ],
  checkIns: [{ date: '2026-09-20', value: 4, sentence: 'Good day' }],
  expenses: [
    {
      date: '2026-09-19',
      category: 'travel',
      what: 'Flight',
      amountOriginal: 240.5,
      currencyOriginal: 'EUR',
    },
  ],
  reserveEntries: [
    { enteredAt: '2026-09-15T00:00:00Z', amount: 9450, currency: 'AUD', cause: 'player' },
  ],
  budgetEstimates: [
    { label: 'Genoa', estimateAmount: 1900, currency: 'AUD', estimatedAt: '2026-09-10T00:00:00Z' },
  ],
};

describe('buildExpensesCsv', () => {
  it('renders one header row plus one row per expense', () => {
    const csv = buildExpensesCsv(SAMPLE_BUNDLE);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('date,category,what,amount,currency');
    expect(lines[1]).toBe('2026-09-19,travel,Flight,240.5,EUR');
  });

  it('is never an empty string, even with zero expenses (Resend refuses an empty-content attachment)', () => {
    const csv = buildExpensesCsv({ ...SAMPLE_BUNDLE, expenses: [] });
    expect(csv).toBe('date,category,what,amount,currency');
    expect(csv.length).toBeGreaterThan(0);
  });
});

describe('buildNotesCsv', () => {
  it('never includes a transcript column', () => {
    const csv = buildNotesCsv(SAMPLE_BUNDLE);
    expect(csv).not.toContain('transcript');
    expect(csv).not.toContain('Felt good on the second serve');
  });
});

describe('buildTranscriptsText', () => {
  it('includes only notes that have a transcript', () => {
    const text = buildTranscriptsText(SAMPLE_BUNDLE);
    expect(text).toContain('Felt good on the second serve today.');
    expect(text.match(/---/g)).toBeNull(); // only one note has a transcript, no separator needed
  });

  it('says so plainly when there are none', () => {
    const text = buildTranscriptsText({ ...SAMPLE_BUNDLE, notes: [] });
    expect(text).toBe('No transcripts yet.');
  });
});

describe('requestDataExport', () => {
  it('emails three attachments and stamps requested/delivered timestamps', async () => {
    const gateDb = fakeGateDb([exportApproval('player-1')]);
    const email = fakeEmailClient();
    const storeExportRequest = vi.fn().mockResolvedValue(undefined);
    const db: DataExportDb = {
      async getPlayerEmail() {
        return 'arya@example.com';
      },
      storeDeletionRequest: vi.fn(),
      async getExportBundle() {
        return SAMPLE_BUNDLE;
      },
      storeExportRequest,
    };

    await requestDataExport(gateDb, email, db, { approvalId: 'approval-1', playerId: 'player-1' });

    expect(email.sent).toHaveLength(1);
    const filenames = email.sent[0]?.attachments?.map((a) => a.filename);
    expect(filenames).toEqual(['data.json', 'expenses.csv', 'notes.csv', 'transcripts.txt']);
    expect(storeExportRequest).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'player-1' }),
    );
  });

  it('refuses a second call for the same approval', async () => {
    const gateDb = fakeGateDb([exportApproval('player-1')]);
    const email = fakeEmailClient();
    const db: DataExportDb = {
      async getPlayerEmail() {
        return 'arya@example.com';
      },
      storeDeletionRequest: vi.fn(),
      async getExportBundle() {
        return SAMPLE_BUNDLE;
      },
      storeExportRequest: vi.fn(),
    };
    const call = () =>
      requestDataExport(gateDb, email, db, { approvalId: 'approval-1', playerId: 'player-1' });

    await call();
    await expect(call()).rejects.toThrow(ApprovalAlreadyConsumedError);
  });
});
