import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type {
  DeliveryRecord,
  DigestDb,
  NotificationDeliveryDb,
} from '@deucex/actions/notifications';

// Step 5.2: the service-role side of notification delivery, behind
// packages/actions' narrow interfaces so the senders never see a database.

const RETRY_MINUTES = [5, 20, 60];

export class SupabaseNotificationDeliveryDb implements NotificationDeliveryDb, DigestDb {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getDelivery(deliveryId: string): Promise<DeliveryRecord | null> {
    const { data, error } = await this.db
      .from('notification_deliveries')
      .select(
        'id, channel, status, attempts, player_id, notifications(id, title, body, action_href, category), players(email)',
      )
      .eq('id', deliveryId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const n = data.notifications as unknown as {
      id: string;
      title: string;
      body: string;
      action_href: string | null;
      category: 'for_you' | 'fyi';
    };
    const p = data.players as unknown as { email: string | null } | null;
    return {
      id: data.id,
      channel: data.channel as DeliveryRecord['channel'],
      status: data.status as DeliveryRecord['status'],
      attempts: data.attempts,
      playerId: data.player_id,
      playerEmail: p?.email ?? null,
      notification: {
        id: n.id,
        title: n.title,
        body: n.body,
        actionHref: n.action_href,
        category: n.category,
      },
    };
  }

  async markSent(deliveryId: string): Promise<void> {
    const { error } = await this.db
      .from('notification_deliveries')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
      .eq('id', deliveryId);
    if (error) throw error;
  }

  async markFailed(deliveryId: string, message: string, final: boolean): Promise<void> {
    const { data, error: readError } = await this.db
      .from('notification_deliveries')
      .select('attempts')
      .eq('id', deliveryId)
      .single();
    if (readError) throw readError;
    const attempts = data.attempts + 1;
    const retryIn = RETRY_MINUTES[Math.min(attempts - 1, RETRY_MINUTES.length - 1)]!;
    const { error } = await this.db
      .from('notification_deliveries')
      .update({
        attempts,
        error: message,
        ...(final
          ? { status: 'failed' }
          : { due_at: new Date(Date.now() + retryIn * 60_000).toISOString() }),
      })
      .eq('id', deliveryId);
    if (error) throw error;
  }

  async markSkipped(deliveryId: string, reason: string): Promise<void> {
    const { error } = await this.db
      .from('notification_deliveries')
      .update({ status: 'skipped', error: reason })
      .eq('id', deliveryId);
    if (error) throw error;
  }

  async listPushSubscriptions(playerId: string) {
    const { data, error } = await this.db
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('player_id', playerId)
      .is('disabled_at', null);
    if (error) throw error;
    return data ?? [];
  }

  async markSubscriptionGone(subscriptionId: string): Promise<void> {
    const { error } = await this.db
      .from('push_subscriptions')
      .update({ disabled_at: new Date().toISOString() })
      .eq('id', subscriptionId);
    if (error) throw error;
  }

  async markSubscriptionUsed(subscriptionId: string): Promise<void> {
    const { error } = await this.db
      .from('push_subscriptions')
      .update({ last_success_at: new Date().toISOString() })
      .eq('id', subscriptionId);
    if (error) throw error;
  }

  // --- DigestDb.

  async listDigestItems(playerId: string) {
    const { data, error } = await this.db
      .from('notification_deliveries')
      .select('id, created_at, notifications(title, body)')
      .eq('player_id', playerId)
      .eq('channel', 'email')
      .eq('status', 'digest')
      .is('digest_id', null)
      .order('created_at');
    if (error) throw error;
    return (data ?? []).map((row) => {
      const n = row.notifications as unknown as { title: string; body: string };
      return { deliveryId: row.id, title: n.title, body: n.body, createdAt: row.created_at };
    });
  }

  async getPlayerEmail(playerId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('players')
      .select('email')
      .eq('id', playerId)
      .maybeSingle();
    if (error) throw error;
    return data?.email ?? null;
  }

  async createDigest(playerId: string, weekStart: string, itemCount: number) {
    const { data, error } = await this.db
      .from('notification_digests')
      .insert({ player_id: playerId, week_start: weekStart, item_count: itemCount })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return null; // this week's digest already exists
      throw error;
    }
    return data.id;
  }

  async markDigestSent(digestId: string, deliveryIds: string[]): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.db
      .from('notification_digests')
      .update({ sent_at: now })
      .eq('id', digestId);
    if (error) throw error;
    const { error: itemsError } = await this.db
      .from('notification_deliveries')
      .update({ digest_id: digestId, sent_at: now })
      .in('id', deliveryIds);
    if (itemsError) throw itemsError;
  }
}
