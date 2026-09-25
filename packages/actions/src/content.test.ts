import { describe, expect, it } from 'vitest';
import { contentPublishPayload } from '@deucex/shared';
import type { ApprovalGateDb, ApprovalRecord } from './gate';
import {
  ApprovalAlreadyConsumedError,
  ApprovalNotFoundError,
  ApprovalPayloadMismatchError,
} from './errors';
import type { EmailClient, SendEmailInput } from './resend-client';
import {
  NoRecipientsError,
  publishUpdateNow,
  renderUpdateEmail,
  scheduleUpdate,
  sendScheduledUpdate,
  UpdateNotPublishableError,
  type ContentActionsDb,
  type ContentRecipient,
  type ContentUpdateRow,
} from './content';

const PLAYER_ID = 'player-1';
const APP = 'https://deucex.vercel.app';

function fakeGate(approvals: ApprovalRecord[]) {
  const byId = new Map(approvals.map((a) => [a.id, a]));
  const claimed: string[] = [];
  const gate: ApprovalGateDb = {
    async getApproval(id, playerId) {
      const a = byId.get(id);
      return a && a.playerId === playerId ? a : null;
    },
    async claimApproval({ approvalId }) {
      if (claimed.includes(approvalId)) return false;
      claimed.push(approvalId);
      return true;
    },
  };
  return { gate, claimed };
}

function baseRow(overrides: Partial<ContentUpdateRow> = {}): ContentUpdateRow {
  return {
    id: 'update-1',
    playerId: PLAYER_ID,
    status: 'draft',
    subject: 'Three set points, one lesson',
    body: 'I lost 6-4 3-6 6-7(5) to Kovalenko yesterday.\n\nThank you for being here.',
    practiceSection: 'Second serves, twenty minutes a day.',
    tierIds: ['tier-court', 'tier-locker'],
    sendAt: null,
    teaser: true,
    approvalId: null,
    ...overrides,
  };
}

const RECIPIENTS: ContentRecipient[] = [
  { patronId: 'p1', tierId: 'tier-court', tierPosition: 1, email: 'mira@example.com' },
  { patronId: 'p2', tierId: 'tier-locker', tierPosition: 2, email: 'jon@example.com' },
];

function fakeDb(row: ContentUpdateRow, recipients: ContentRecipient[] = RECIPIENTS) {
  const state = {
    row: { ...row },
    sends: [] as Array<{ patronId: string; status: string; emailId: string | null }>,
  };
  const db: ContentActionsDb = {
    async getUpdate(playerId, updateId) {
      return playerId === state.row.playerId && updateId === state.row.id ? { ...state.row } : null;
    },
    async getSender() {
      return { name: 'Arya Dubey', email: 'arya@example.com', slug: 'arya-dubey' };
    },
    async listRecipients(_p, tierIds) {
      return recipients.filter((r) => tierIds.includes(r.tierId));
    },
    async listSentPatronIds() {
      return state.sends.filter((s) => s.status === 'sent').map((s) => s.patronId);
    },
    async recordSend(input) {
      state.sends = state.sends.filter((s) => s.patronId !== input.patronId);
      state.sends.push({ patronId: input.patronId, status: input.status, emailId: input.emailId });
    },
    async setStatus(_id, patch) {
      state.row.status = patch.status;
      if (patch.approvalId !== undefined) state.row.approvalId = patch.approvalId;
    },
  };
  return { db, state };
}

function fakeEmail(failFor: string[] = []) {
  const sent: SendEmailInput[] = [];
  const client: EmailClient = {
    async sendEmail(input) {
      if (failFor.includes(input.to)) throw new Error('Resend refused');
      sent.push(input);
      return { id: `email-${sent.length}` };
    },
  };
  return { client, sent };
}

function approvalFor(row: ContentUpdateRow, id = 'approval-1'): ApprovalRecord {
  return {
    id,
    playerId: PLAYER_ID,
    actionType: 'content_publish',
    payload: contentPublishPayload({
      updateId: row.id,
      subject: row.subject,
      body: row.body,
      practiceSection: row.practiceSection,
      tierIds: row.tierIds,
      sendAt: row.sendAt,
      teaser: row.teaser,
    }),
  };
}

const input = {
  approvalId: 'approval-1',
  playerId: PLAYER_ID,
  updateId: 'update-1',
  appBaseUrl: APP,
};

describe('publishUpdateNow', () => {
  it('sends nothing without the approval row (build plan: done when)', async () => {
    const { db, state } = fakeDb(baseRow());
    const { gate } = fakeGate([]);
    const email = fakeEmail();
    await expect(publishUpdateNow(gate, db, email.client, input)).rejects.toBeInstanceOf(
      ApprovalNotFoundError,
    );
    expect(email.sent).toHaveLength(0);
    expect(state.row.status).toBe('draft');
  });

  it('sends nothing when the draft changed after the approval', async () => {
    const row = baseRow();
    const { db, state } = fakeDb({ ...row, body: `${row.body}\n\nOne more line.` });
    const { gate } = fakeGate([approvalFor(row)]);
    const email = fakeEmail();
    await expect(publishUpdateNow(gate, db, email.client, input)).rejects.toBeInstanceOf(
      ApprovalPayloadMismatchError,
    );
    expect(email.sent).toHaveLength(0);
    expect(state.row.status).toBe('draft');
  });

  it('C-14 / C-AC-6: one email per receiving patron, from the player, then Published', async () => {
    const row = baseRow();
    const { db, state } = fakeDb(row);
    const { gate, claimed } = fakeGate([approvalFor(row)]);
    const email = fakeEmail();
    const result = await publishUpdateNow(gate, db, email.client, input);
    expect(result).toMatchObject({ recipientCount: 2, deliveredCount: 2 });
    expect(email.sent.map((e) => e.to)).toEqual(['mira@example.com', 'jon@example.com']);
    expect(email.sent[0]).toMatchObject({
      subject: 'Three set points, one lesson',
      fromName: 'Arya Dubey',
      replyTo: 'arya@example.com',
    });
    // C-9: only Locker Room and above get the practice section.
    expect(email.sent[0]!.html).not.toContain('Practice notes');
    expect(email.sent[1]!.html).toContain('Practice notes');
    expect(email.sent[0]!.html).toContain(`${APP}/p/arya-dubey/manage`);
    expect(state.row.status).toBe('published');
    expect(state.sends.map((s) => s.emailId)).toEqual(['email-1', 'email-2']);
    expect(claimed).toEqual(['approval-1']);
  });

  it('refuses a second publish with the same approval', async () => {
    const row = baseRow();
    const { db, state } = fakeDb(row);
    const { gate } = fakeGate([approvalFor(row)]);
    await publishUpdateNow(gate, db, fakeEmail().client, input);
    state.row.status = 'send_failed'; // even if the row were retried
    await expect(publishUpdateNow(gate, db, fakeEmail().client, input)).rejects.toBeInstanceOf(
      ApprovalAlreadyConsumedError,
    );
  });

  it('refuses with no patrons to send to, before consuming the approval', async () => {
    const row = baseRow();
    const { db } = fakeDb(row, []);
    const { gate, claimed } = fakeGate([approvalFor(row)]);
    await expect(publishUpdateNow(gate, db, fakeEmail().client, input)).rejects.toBeInstanceOf(
      NoRecipientsError,
    );
    expect(claimed).toEqual([]);
  });

  it('marks Send failed when nothing reached patrons, and a retry skips who already got it', async () => {
    const row = baseRow();
    const { db, state } = fakeDb(row);
    const { gate } = fakeGate([approvalFor(row), approvalFor(row, 'approval-2')]);
    await publishUpdateNow(
      gate,
      db,
      fakeEmail(['mira@example.com', 'jon@example.com']).client,
      input,
    );
    expect(state.row.status).toBe('send_failed');

    const partial = fakeEmail(['jon@example.com']);
    await publishUpdateNow(gate, db, partial.client, { ...input, approvalId: 'approval-2' });
    expect(state.row.status).toBe('published');
    expect(partial.sent.map((e) => e.to)).toEqual(['mira@example.com']);
  });

  it('will not publish a scheduled or already published update', async () => {
    for (const status of ['scheduled', 'published', 'skipped']) {
      const row = baseRow({ status });
      const { db } = fakeDb(row);
      const { gate } = fakeGate([approvalFor(row)]);
      await expect(publishUpdateNow(gate, db, fakeEmail().client, input)).rejects.toBeInstanceOf(
        UpdateNotPublishableError,
      );
    }
  });
});

describe('scheduled updates (C-12, C-AC-7)', () => {
  const now = new Date('2026-09-12T06:00:00Z');
  const sendAt = '2026-09-13T05:00:00.000Z';

  it('scheduling records the approval without claiming it or sending', async () => {
    const row = baseRow({ sendAt });
    const { db, state } = fakeDb(row);
    const { gate, claimed } = fakeGate([approvalFor(row)]);
    const email = fakeEmail();
    await scheduleUpdate(gate, db, {
      approvalId: 'approval-1',
      playerId: PLAYER_ID,
      updateId: row.id,
      now,
    });
    expect(state.row.status).toBe('scheduled');
    expect(state.row.approvalId).toBe('approval-1');
    expect(claimed).toEqual([]);
    expect(email.sent).toHaveLength(0);
  });

  it('the send-time tick claims the approval and sends to whoever is receiving then', async () => {
    const row = baseRow({ sendAt });
    const { db, state } = fakeDb(row);
    const { gate, claimed } = fakeGate([approvalFor(row)]);
    await scheduleUpdate(gate, db, {
      approvalId: 'approval-1',
      playerId: PLAYER_ID,
      updateId: row.id,
      now,
    });
    const email = fakeEmail();
    const result = await sendScheduledUpdate(gate, db, email.client, {
      playerId: PLAYER_ID,
      updateId: row.id,
      appBaseUrl: APP,
    });
    expect(result?.deliveredCount).toBe(2);
    expect(claimed).toEqual(['approval-1']);
    expect(state.row.status).toBe('published');
  });

  it('a cancelled schedule (back to draft) sends nothing at the send time', async () => {
    const row = baseRow({ sendAt });
    const { db, state } = fakeDb(row);
    const { gate, claimed } = fakeGate([approvalFor(row)]);
    await scheduleUpdate(gate, db, {
      approvalId: 'approval-1',
      playerId: PLAYER_ID,
      updateId: row.id,
      now,
    });
    state.row.status = 'draft';
    const email = fakeEmail();
    expect(
      await sendScheduledUpdate(gate, db, email.client, {
        playerId: PLAYER_ID,
        updateId: row.id,
        appBaseUrl: APP,
      }),
    ).toBeNull();
    expect(email.sent).toHaveLength(0);
    expect(claimed).toEqual([]);
  });

  it('refuses a schedule whose approval does not match the draft', async () => {
    const row = baseRow({ sendAt });
    const { db } = fakeDb(row);
    const { gate } = fakeGate([approvalFor({ ...row, subject: 'Something else' })]);
    await expect(
      scheduleUpdate(gate, db, {
        approvalId: 'approval-1',
        playerId: PLAYER_ID,
        updateId: row.id,
        now,
      }),
    ).rejects.toBeInstanceOf(ApprovalPayloadMismatchError);
  });
});

describe('renderUpdateEmail', () => {
  it('escapes the player text', () => {
    const html = renderUpdateEmail({
      body: 'Score <b>6-4</b> & more',
      practiceSection: null,
      tierPosition: 1,
      playerName: 'Arya Dubey',
      manageUrl: null,
    });
    expect(html).toContain('Score &lt;b&gt;6-4&lt;/b&gt; &amp; more');
    expect(html).toContain("back Arya's season");
  });
});
