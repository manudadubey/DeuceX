import { describe, expect, it, vi } from 'vitest';
import {
  DeliveryNotPendingError,
  sendNotificationEmail,
  sendNotificationPush,
  sendWeeklyDigest,
  type DeliveryRecord,
  type DigestDb,
  type NotificationDeliveryDb,
} from './notifications';

// Step 5.2: notification email and push go only to the player themselves,
// only for a pending delivery, and only once.

function fakeDb(delivery: Partial<DeliveryRecord> = {}) {
  const record: DeliveryRecord = {
    id: 'd1',
    channel: 'email',
    status: 'pending',
    attempts: 0,
    playerId: 'p1',
    playerEmail: 'arya@example.test',
    notification: {
      id: 'n1',
      title: 'Weekly shortlist ready',
      body: '14 events scanned, 5 shortlisted.',
      actionHref: '/agent/tournament',
      category: 'fyi',
    },
    ...delivery,
  };
  const subs = [
    { id: 's1', endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' },
    { id: 's2', endpoint: 'https://push.example/2', p256dh: 'k', auth: 'a' },
  ];
  const db = {
    record,
    subs,
    getDelivery: vi.fn(async (id: string) => (id === record.id ? record : null)),
    markSent: vi.fn(async () => {
      record.status = 'sent';
    }),
    markFailed: vi.fn(async (_id: string, _e: string, final: boolean) => {
      record.attempts += 1;
      if (final) record.status = 'failed';
    }),
    markSkipped: vi.fn(async () => {
      record.status = 'skipped';
    }),
    listPushSubscriptions: vi.fn(async () => subs),
    markSubscriptionGone: vi.fn(async () => undefined),
    markSubscriptionUsed: vi.fn(async () => undefined),
  } satisfies NotificationDeliveryDb & { record: DeliveryRecord; subs: typeof subs };
  return db;
}

describe('sendNotificationEmail', () => {
  it("sends to the player's own address, then marks the delivery sent", async () => {
    const db = fakeDb();
    const sendEmail = vi.fn(async () => ({ id: 'e1' }));
    await expect(
      sendNotificationEmail(
        db,
        { sendEmail },
        { deliveryId: 'd1', appBaseUrl: 'https://app.test' },
      ),
    ).resolves.toBe('sent');
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'arya@example.test', subject: 'Weekly shortlist ready' }),
    );
    const html = (sendEmail.mock.calls[0] as unknown as [{ html: string }])[0].html;
    expect(html).toContain('https://app.test/agent/tournament');
    expect(db.record.status).toBe('sent');
  });

  it('refuses a delivery that is not pending, so nothing sends twice', async () => {
    const db = fakeDb({ status: 'sent' });
    const sendEmail = vi.fn();
    await expect(
      sendNotificationEmail(
        db,
        { sendEmail },
        { deliveryId: 'd1', appBaseUrl: 'https://app.test' },
      ),
    ).rejects.toBeInstanceOf(DeliveryNotPendingError);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('refuses a push delivery on the email path', async () => {
    const db = fakeDb({ channel: 'push' });
    await expect(
      sendNotificationEmail(db, { sendEmail: vi.fn() }, { deliveryId: 'd1', appBaseUrl: 'x' }),
    ).rejects.toBeInstanceOf(DeliveryNotPendingError);
  });

  it('retries a failed send, and gives up after the third attempt', async () => {
    const db = fakeDb();
    const sendEmail = vi.fn(async () => {
      throw new Error('Resend down');
    });
    for (let i = 0; i < 3; i++) {
      await sendNotificationEmail(db, { sendEmail }, { deliveryId: 'd1', appBaseUrl: 'x' });
    }
    expect(db.markFailed).toHaveBeenLastCalledWith('d1', 'Resend down', true);
    expect(db.record.status).toBe('failed');
  });

  it('escapes notification text in the email', async () => {
    const db = fakeDb({
      notification: {
        id: 'n1',
        title: 'T',
        body: '<script>x</script>',
        actionHref: null,
        category: 'fyi',
      },
    });
    const sendEmail = vi.fn(async () => undefined);
    await sendNotificationEmail(db, { sendEmail }, { deliveryId: 'd1', appBaseUrl: 'x' });
    const html = (sendEmail.mock.calls[0] as unknown as [{ html: string }])[0].html;
    expect(html).not.toContain('<script>');
  });
});

describe('sendNotificationPush', () => {
  it("pushes to each of the player's own subscriptions and retires a gone one", async () => {
    const db = fakeDb({ channel: 'push' });
    const send = vi.fn(async (sub: { endpoint: string }) => ({
      gone: sub.endpoint.endsWith('/2'),
    }));
    await expect(
      sendNotificationPush(db, { send }, { deliveryId: 'd1', appBaseUrl: 'https://app.test' }),
    ).resolves.toBe('sent');
    expect(db.listPushSubscriptions).toHaveBeenCalledWith('p1');
    expect(JSON.parse((send.mock.calls[0] as unknown as [unknown, string])[1])).toMatchObject({
      title: 'Weekly shortlist ready',
      url: 'https://app.test/agent/tournament',
    });
    expect(db.markSubscriptionGone).toHaveBeenCalledWith('s2');
    expect(db.markSubscriptionUsed).toHaveBeenCalledWith('s1');
  });

  it('skips a push when the player has no subscription left', async () => {
    const db = fakeDb({ channel: 'push' });
    db.listPushSubscriptions.mockResolvedValueOnce([]);
    await expect(
      sendNotificationPush(db, { send: vi.fn() }, { deliveryId: 'd1', appBaseUrl: 'x' }),
    ).resolves.toBe('skipped');
  });
});

describe('sendWeeklyDigest (M-NOTIF-3)', () => {
  function digestDb(existing = false): DigestDb & { sent: string[][] } {
    const sent: string[][] = [];
    return {
      sent,
      listDigestItems: async () => [
        { deliveryId: 'd6', title: 'Patron joined', body: 'Mira joined Courtside.', createdAt: '' },
        { deliveryId: 'd7', title: 'Payout sent', body: 'EUR 120 on its way.', createdAt: '' },
      ],
      getPlayerEmail: async () => 'arya@example.test',
      createDigest: async () => (existing ? null : 'dg1'),
      markDigestSent: async (_id, ids) => {
        sent.push(ids);
      },
    };
  }

  it("sends one digest of the week's held FYI emails to the player", async () => {
    const db = digestDb();
    const sendEmail = vi.fn(async () => undefined);
    await expect(
      sendWeeklyDigest(
        db,
        { sendEmail },
        { playerId: 'p1', weekStart: '2026-09-21', appBaseUrl: 'x' },
      ),
    ).resolves.toBe('sent');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'arya@example.test',
        subject: 'Your week in DeuceX: 2 updates',
      }),
    );
    expect(db.sent).toEqual([['d6', 'd7']]);
  });

  it('sends nothing when this week already had its digest', async () => {
    const sendEmail = vi.fn();
    await expect(
      sendWeeklyDigest(
        digestDb(true),
        { sendEmail },
        {
          playerId: 'p1',
          weekStart: '2026-09-21',
          appBaseUrl: 'x',
        },
      ),
    ).resolves.toBe('already_sent');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
