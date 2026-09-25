import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NotificationPrefs } from '@deucex/db';
import type { EmailClient } from '@deucex/actions/account';
import {
  DeliveryNotPendingError,
  sendNotificationEmail,
  sendNotificationPush,
  sendStaffAlertEmail,
  sendWeeklyDigest,
  type PushClient,
} from '@deucex/actions/notifications';
import type { PgBoss } from 'pg-boss';
import { localMinutes, planDeliveries, weekStart } from './plan';
import { SupabaseNotificationDeliveryDb } from './store';

// Step 5.2's delivery sweep. Every agent keeps writing its notifications
// row exactly as before (about nine writers); this sweep picks each new
// row up, plans its email and push deliveries from the player's settings
// (plan.ts), and sends whatever is due. Once a minute:
// - plan new notifications; one created more than a day ago (apps/api was
//   down) is marked planned with no deliveries rather than sent late;
// - send due deliveries, retrying a failure at 5, 20 and 60 minutes;
// - email new staff alerts by the console's alert routing (AD-27).
// Once an hour:
// - Monday 07:00 local: the weekly FYI digest (M-NOTIF-3);
// - the 24-hour distress escalation to the owner (AD-25, AD-AC-12).

export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery';
export const NOTIFICATION_HOURLY_QUEUE = 'notification-hourly';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const DISTRESS_CONFIRM_MS = 24 * 60 * 60 * 1000;
const DIGEST_HOUR_MINUTES = 7 * 60;

export interface NotificationDeliveryDeps {
  db: SupabaseClient<Database>;
  email: EmailClient;
  /** Absent when no VAPID keys are configured: push deliveries are skipped. */
  push: PushClient | null;
  appBaseUrl: string;
  adminBaseUrl: string;
  logger?: { error(...args: unknown[]): void; info?(...args: unknown[]): void };
}

export async function planNewNotifications(
  db: SupabaseClient<Database>,
  now: Date,
): Promise<number> {
  const { data: notes, error } = await db
    .from('notifications')
    .select('id, player_id, agent, category, deadline_at, created_at')
    .is('delivery_planned_at', null)
    .order('created_at')
    .limit(200);
  if (error) throw error;
  if (!notes?.length) return 0;

  const playerIds = [...new Set(notes.map((n) => n.player_id))];
  const [{ data: players, error: pErr }, { data: subs, error: sErr }, { data: fyi, error: fErr }] =
    await Promise.all([
      db
        .from('players')
        .select('id, email, timezone, quiet_hours_start, quiet_hours_end, notification_prefs')
        .in('id', playerIds),
      db
        .from('push_subscriptions')
        .select('player_id')
        .in('player_id', playerIds)
        .is('disabled_at', null),
      db
        .from('notification_deliveries')
        .select('player_id, notifications!inner(category)')
        .in('player_id', playerIds)
        .eq('channel', 'email')
        .in('status', ['pending', 'sent'])
        .eq('notifications.category', 'fyi')
        .gte('created_at', new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString()),
    ]);
  if (pErr) throw pErr;
  if (sErr) throw sErr;
  if (fErr) throw fErr;

  const byId = new Map((players ?? []).map((p) => [p.id, p]));
  const withPush = new Set((subs ?? []).map((s) => s.player_id));
  const fyiCount = new Map<string, number>();
  for (const row of fyi ?? []) fyiCount.set(row.player_id, (fyiCount.get(row.player_id) ?? 0) + 1);

  const rows: Database['public']['Tables']['notification_deliveries']['Insert'][] = [];
  for (const n of notes) {
    const p = byId.get(n.player_id);
    if (!p || now.getTime() - new Date(n.created_at).getTime() > STALE_AFTER_MS) continue;
    const planned = planDeliveries(
      {
        agent: n.agent,
        category: n.category as 'for_you' | 'fyi',
        deadlineAt: n.deadline_at,
      },
      {
        email: p.email,
        timezone: p.timezone,
        quietHours: { start: p.quiet_hours_start, end: p.quiet_hours_end },
        prefs: (p.notification_prefs ?? {}) as NotificationPrefs,
        hasPushSubscription: withPush.has(p.id),
        fyiEmailsLastWeek: fyiCount.get(p.id) ?? 0,
      },
      now,
    );
    for (const d of planned) {
      rows.push({
        notification_id: n.id,
        player_id: n.player_id,
        channel: d.channel,
        status: d.status,
        due_at: d.dueAt.toISOString(),
        held_for_quiet_hours: d.heldForQuietHours,
      });
      // Within one sweep, later FYI emails count the earlier ones too.
      if (d.channel === 'email' && d.status === 'pending' && n.category === 'fyi') {
        fyiCount.set(p.id, (fyiCount.get(p.id) ?? 0) + 1);
      }
    }
  }

  if (rows.length) {
    const { error: insErr } = await db
      .from('notification_deliveries')
      .upsert(rows, { onConflict: 'notification_id,channel', ignoreDuplicates: true });
    if (insErr) throw insErr;
  }
  const { error: updErr } = await db
    .from('notifications')
    .update({ delivery_planned_at: now.toISOString() })
    .in(
      'id',
      notes.map((n) => n.id),
    );
  if (updErr) throw updErr;
  return rows.length;
}

export async function sendDueDeliveries(
  deps: NotificationDeliveryDeps,
  now: Date,
): Promise<Record<string, number>> {
  const { data, error } = await deps.db
    .from('notification_deliveries')
    .select('id, channel')
    .eq('status', 'pending')
    .lte('due_at', now.toISOString())
    .order('due_at')
    .limit(100);
  if (error) throw error;
  const store = new SupabaseNotificationDeliveryDb(deps.db);
  const counts: Record<string, number> = {};
  for (const d of data ?? []) {
    let outcome: string;
    try {
      if (d.channel === 'email') {
        outcome = await sendNotificationEmail(store, deps.email, {
          deliveryId: d.id,
          appBaseUrl: deps.appBaseUrl,
        });
      } else if (deps.push) {
        outcome = await sendNotificationPush(store, deps.push, {
          deliveryId: d.id,
          appBaseUrl: deps.appBaseUrl,
        });
      } else {
        await store.markSkipped(d.id, 'Push is not configured in this environment.');
        outcome = 'skipped';
      }
    } catch (err) {
      if (err instanceof DeliveryNotPendingError) continue;
      throw err;
    }
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  }
  return counts;
}

/** Monday 07:00 local: one digest of the week's held FYI emails per player. */
export async function sendDigests(deps: NotificationDeliveryDeps, now: Date): Promise<number> {
  const { data, error } = await deps.db
    .from('notification_deliveries')
    .select('player_id, players(timezone)')
    .eq('channel', 'email')
    .eq('status', 'digest')
    .is('digest_id', null);
  if (error) throw error;
  const zones = new Map<string, string>();
  for (const row of data ?? []) {
    zones.set(row.player_id, (row.players as unknown as { timezone: string }).timezone);
  }
  const store = new SupabaseNotificationDeliveryDb(deps.db);
  let sent = 0;
  for (const [playerId, timezone] of zones) {
    const localDay = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'short',
    }).format(now);
    const minutes = localMinutes(now, timezone);
    if (localDay !== 'Mon' || minutes < DIGEST_HOUR_MINUTES || minutes >= DIGEST_HOUR_MINUTES + 60)
      continue;
    const result = await sendWeeklyDigest(store, deps.email, {
      playerId,
      weekStart: weekStart(now, timezone),
      appBaseUrl: deps.appBaseUrl,
    });
    if (result === 'sent') sent += 1;
  }
  return sent;
}

type Role = 'support' | 'ops' | 'owner';

/**
 * Who gets a staff alert by email (AD-27): each role whose routing says
 * email. A role with no routing row falls back to the console's default:
 * the owning role gets needs-action alerts (admin/queries.ts getRouting).
 */
export function emailRolesForAlert(
  alert: { kind: string; category: string; role_owner: string | null },
  routes: Array<{ role: string; alert_kind: string; email: boolean }>,
): Role[] {
  return (['support', 'ops', 'owner'] as const).filter((role) => {
    const route = routes.find((r) => r.role === role && r.alert_kind === alert.kind);
    if (route) return route.email;
    return alert.category === 'act' && alert.role_owner === role;
  });
}

export async function deliverStaffAlerts(
  deps: NotificationDeliveryDeps,
  now: Date,
): Promise<number> {
  const { data: alerts, error } = await deps.db
    .from('alerts')
    .select('id, kind, category, title, body, link, role_owner')
    .is('emailed_at', null)
    .order('created_at')
    .limit(50);
  if (error) throw error;
  if (!alerts?.length) return 0;
  const [{ data: routes, error: rErr }, { data: staff, error: sErr }] = await Promise.all([
    deps.db.from('alert_routes').select('role, alert_kind, email'),
    deps.db.from('admin_users').select('email, role').is('revoked_at', null),
  ]);
  if (rErr) throw rErr;
  if (sErr) throw sErr;

  let sent = 0;
  for (const alert of alerts) {
    const roles = emailRolesForAlert(alert, routes ?? []);
    const recipients = [
      ...new Set((staff ?? []).filter((s) => roles.includes(s.role as Role)).map((s) => s.email)),
    ];
    for (const to of recipients) {
      try {
        await sendStaffAlertEmail(deps.email, {
          to,
          alert: {
            title: alert.title,
            body: alert.body,
            link: alert.link,
            category: alert.category as 'act' | 'fyi',
          },
          adminBaseUrl: deps.adminBaseUrl,
        });
        sent += 1;
      } catch (err) {
        deps.logger?.error('[notifications] staff alert email failed:', alert.id, err);
      }
    }
    // Marked either way: the alert is always in the console's Alerts sheet,
    // and a failed email isn't retried into a flood.
    const { error: updErr } = await deps.db
      .from('alerts')
      .update({ emailed_at: now.toISOString() })
      .eq('id', alert.id);
    if (updErr) throw updErr;
  }
  return sent;
}

/**
 * AD-25 and AD-AC-12: a distress case with no confirmation that the
 * "Someone to call" card was shown, 24 hours after it opened, escalates to
 * the owner once. The alert's own email goes out through deliverStaffAlerts.
 */
export async function escalateDistressCases(
  db: SupabaseClient<Database>,
  now: Date,
): Promise<number> {
  const { data, error } = await db
    .from('cases')
    .select('id, player_id, opened_at')
    .eq('kind', 'distress')
    .is('resolved_at', null)
    .is('card_shown_confirmed_at', null)
    .is('escalated_at', null)
    .lte('opened_at', new Date(now.getTime() - DISTRESS_CONFIRM_MS).toISOString());
  if (error) throw error;
  for (const c of data ?? []) {
    const { error: alertErr } = await db.from('alerts').insert({
      kind: 'distress_escalated',
      category: 'act',
      title: 'Distress case unconfirmed at 24 hours',
      body: 'Nobody has confirmed the "Someone to call" card was shown. Open the case in Trust and safety.',
      link: '/trust',
      role_owner: 'owner',
      player_id: c.player_id,
      dedupe_key: `distress_escalated:${c.id}`,
    });
    if (alertErr && alertErr.code !== '23505') throw alertErr;
    const { error: caseErr } = await db
      .from('cases')
      .update({ escalated_at: now.toISOString() })
      .eq('id', c.id);
    if (caseErr) throw caseErr;
  }
  return data?.length ?? 0;
}

export async function registerNotificationDelivery(
  boss: PgBoss,
  deps: NotificationDeliveryDeps & { now?: () => Date },
): Promise<void> {
  const logger = deps.logger ?? console;
  const now = () => (deps.now ?? (() => new Date()))();

  await boss.createQueue(NOTIFICATION_DELIVERY_QUEUE);
  await boss.schedule(NOTIFICATION_DELIVERY_QUEUE, '* * * * *', {});
  await boss.work(NOTIFICATION_DELIVERY_QUEUE, async () => {
    try {
      await planNewNotifications(deps.db, now());
      await sendDueDeliveries(deps, now());
      await deliverStaffAlerts(deps, now());
    } catch (err) {
      logger.error('[notifications] delivery tick failed:', err);
      throw err;
    }
  });

  await boss.createQueue(NOTIFICATION_HOURLY_QUEUE);
  await boss.schedule(NOTIFICATION_HOURLY_QUEUE, '0 * * * *', {});
  await boss.work(NOTIFICATION_HOURLY_QUEUE, async () => {
    try {
      await escalateDistressCases(deps.db, now());
      await sendDigests(deps, now());
    } catch (err) {
      logger.error('[notifications] hourly tick failed:', err);
      throw err;
    }
  });
}
