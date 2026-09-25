import type { EmailClient } from './resend-client';
import type { PushClient } from './push-client';

// Step 5.2: notification email and push to the player themselves (PRD-00
// 5.6, PRD-12 4.5). Owner decision, 26 September 2026: the player's own
// Notifications settings are their standing consent for these, so they
// need no per-message approval row. What keeps that narrow is structural:
// - no function here takes a recipient. An email goes only to the address
//   on the delivery's own player row, and a push only to that player's own
//   subscriptions, both read through NotificationDeliveryDb;
// - a delivery row exists only if apps/api's planner found the channel
//   switched on in that player's settings (apps/api/src/notifications/plan.ts);
// - each delivery sends at most once: it must still be pending, and it is
//   marked sent or failed straight after.
// Anything to anyone else (patrons, sponsors, entries) still needs a
// player-authored approval through gate.ts.

export interface DeliveryRecord {
  id: string;
  channel: 'email' | 'push';
  status: 'pending' | 'sent' | 'failed' | 'digest' | 'skipped';
  attempts: number;
  playerId: string;
  playerEmail: string | null;
  notification: {
    id: string;
    title: string;
    body: string;
    actionHref: string | null;
    category: 'for_you' | 'fyi';
  };
}

export interface NotificationDeliveryDb {
  getDelivery(deliveryId: string): Promise<DeliveryRecord | null>;
  markSent(deliveryId: string): Promise<void>;
  /** Records a failed attempt; `final` ends retrying. */
  markFailed(deliveryId: string, error: string, final: boolean): Promise<void>;
  markSkipped(deliveryId: string, reason: string): Promise<void>;
  listPushSubscriptions(
    playerId: string,
  ): Promise<Array<{ id: string; endpoint: string; p256dh: string; auth: string }>>;
  markSubscriptionGone(subscriptionId: string): Promise<void>;
  markSubscriptionUsed(subscriptionId: string): Promise<void>;
}

export const MAX_DELIVERY_ATTEMPTS = 3;

export class DeliveryNotPendingError extends Error {
  constructor(deliveryId: string) {
    super(`Notification delivery ${deliveryId} is not pending.`);
    this.name = 'DeliveryNotPendingError';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function absolute(appBaseUrl: string, href: string | null): string {
  if (!href) return appBaseUrl;
  return /^https?:\/\//.test(href) ? href : `${appBaseUrl.replace(/\/$/, '')}${href}`;
}

function footer(appBaseUrl: string): string {
  return `<p style="color:#666;font-size:13px">You get this because email is on for this kind of notification. <a href="${escapeHtml(absolute(appBaseUrl, '/settings?pane=notifications'))}">Change it in Settings, Notifications</a>.</p>`;
}

export function notificationEmailHtml(
  n: DeliveryRecord['notification'],
  appBaseUrl: string,
): string {
  return [
    `<h2 style="font-size:18px">${escapeHtml(n.title)}</h2>`,
    `<p>${escapeHtml(n.body)}</p>`,
    `<p><a href="${escapeHtml(absolute(appBaseUrl, n.actionHref))}">Open DeuceX</a></p>`,
    footer(appBaseUrl),
  ].join('\n');
}

async function loadPending(
  db: NotificationDeliveryDb,
  deliveryId: string,
  channel: 'email' | 'push',
) {
  const delivery = await db.getDelivery(deliveryId);
  if (!delivery || delivery.status !== 'pending' || delivery.channel !== channel) {
    throw new DeliveryNotPendingError(deliveryId);
  }
  return delivery;
}

async function fail(db: NotificationDeliveryDb, delivery: DeliveryRecord, error: unknown) {
  const text = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  await db.markFailed(delivery.id, text, delivery.attempts + 1 >= MAX_DELIVERY_ATTEMPTS);
}

/** Emails one notification to the player's own address. */
export async function sendNotificationEmail(
  db: NotificationDeliveryDb,
  email: EmailClient,
  input: { deliveryId: string; appBaseUrl: string },
): Promise<'sent' | 'skipped' | 'failed'> {
  const delivery = await loadPending(db, input.deliveryId, 'email');
  if (!delivery.playerEmail) {
    await db.markSkipped(delivery.id, 'The player has no email address.');
    return 'skipped';
  }
  try {
    await email.sendEmail({
      to: delivery.playerEmail,
      subject: delivery.notification.title,
      html: notificationEmailHtml(delivery.notification, input.appBaseUrl),
    });
  } catch (error) {
    await fail(db, delivery, error);
    return 'failed';
  }
  await db.markSent(delivery.id);
  return 'sent';
}

/** Pushes one notification to every one of the player's own subscriptions. */
export async function sendNotificationPush(
  db: NotificationDeliveryDb,
  push: PushClient,
  input: { deliveryId: string; appBaseUrl: string },
): Promise<'sent' | 'skipped' | 'failed'> {
  const delivery = await loadPending(db, input.deliveryId, 'push');
  const subscriptions = await db.listPushSubscriptions(delivery.playerId);
  if (!subscriptions.length) {
    await db.markSkipped(delivery.id, 'No active push subscription.');
    return 'skipped';
  }
  const payload = JSON.stringify({
    title: delivery.notification.title,
    body: delivery.notification.body,
    url: absolute(input.appBaseUrl, delivery.notification.actionHref),
    tag: delivery.notification.id,
  });
  let delivered = 0;
  let lastError: unknown = null;
  for (const subscription of subscriptions) {
    try {
      const { gone } = await push.send(subscription, payload);
      if (gone) {
        await db.markSubscriptionGone(subscription.id);
      } else {
        delivered += 1;
        await db.markSubscriptionUsed(subscription.id);
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (delivered > 0) {
    await db.markSent(delivery.id);
    return 'sent';
  }
  if (lastError) {
    await fail(db, delivery, lastError);
    return 'failed';
  }
  await db.markSkipped(delivery.id, 'Every push subscription had expired.');
  return 'skipped';
}

// --- The weekly FYI digest (M-NOTIF-3).

export interface DigestDb {
  /** FYI email deliveries marked 'digest' and not yet in a sent digest. */
  listDigestItems(
    playerId: string,
  ): Promise<Array<{ deliveryId: string; title: string; body: string; createdAt: string }>>;
  getPlayerEmail(playerId: string): Promise<string | null>;
  /** Creates the week's digest row; null when this week's digest already exists. */
  createDigest(playerId: string, weekStart: string, itemCount: number): Promise<string | null>;
  markDigestSent(digestId: string, deliveryIds: string[]): Promise<void>;
}

export function digestEmailHtml(
  items: Array<{ title: string; body: string }>,
  appBaseUrl: string,
): string {
  return [
    `<h2 style="font-size:18px">Your week in DeuceX</h2>`,
    `<p>${items.length} updates you would otherwise have had as separate emails.</p>`,
    ...items.map((i) => `<p><strong>${escapeHtml(i.title)}</strong><br>${escapeHtml(i.body)}</p>`),
    `<p><a href="${escapeHtml(appBaseUrl)}">Open DeuceX</a></p>`,
    footer(appBaseUrl),
  ].join('\n');
}

/** Sends the week's digest to the player's own address, once per week. */
export async function sendWeeklyDigest(
  db: DigestDb,
  email: EmailClient,
  input: { playerId: string; weekStart: string; appBaseUrl: string },
): Promise<'sent' | 'nothing' | 'already_sent'> {
  const items = await db.listDigestItems(input.playerId);
  if (!items.length) return 'nothing';
  const to = await db.getPlayerEmail(input.playerId);
  if (!to) return 'nothing';
  const digestId = await db.createDigest(input.playerId, input.weekStart, items.length);
  if (!digestId) return 'already_sent';
  await email.sendEmail({
    to,
    subject: `Your week in DeuceX: ${items.length} updates`,
    html: digestEmailHtml(items, input.appBaseUrl),
  });
  await db.markDigestSent(
    digestId,
    items.map((i) => i.deliveryId),
  );
  return 'sent';
}

// --- Staff alerts (PRD-13 AD-27). Internal mail to staff addresses from
// admin_users by alert_routes, like step 5.1's staff console link: not
// player-facing, so outside both gates.

export async function sendStaffAlertEmail(
  email: EmailClient,
  input: {
    to: string;
    alert: { title: string; body: string; link: string | null; category: 'act' | 'fyi' };
    adminBaseUrl: string;
  },
): Promise<void> {
  const prefix = input.alert.category === 'act' ? 'Needs action' : 'FYI';
  const link = input.alert.link
    ? `${input.adminBaseUrl.replace(/\/$/, '')}${input.alert.link}`
    : input.adminBaseUrl;
  await email.sendEmail({
    to: input.to,
    subject: `${prefix}: ${input.alert.title}`,
    html: [
      `<h2 style="font-size:18px">${escapeHtml(input.alert.title)}</h2>`,
      `<p>${escapeHtml(input.alert.body)}</p>`,
      `<p><a href="${escapeHtml(link)}">Open the console</a></p>`,
      `<p style="color:#666;font-size:13px">Sent by your alert routing in the DeuceX console.</p>`,
    ].join('\n'),
  });
}
