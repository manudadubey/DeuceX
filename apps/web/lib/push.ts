'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';

// Step 5.2: Web Push for this browser (owner decision 26 September 2026;
// native push arrives with step 5.3). Subscribing stores the endpoint in
// push_subscriptions, which RLS limits to the player's own rows; apps/api
// sends from there. iOS only supports this from a home-screen install.

const SW_URL = '/push-sw.js';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? '';

export type PushState = 'unsupported' | 'unconfigured' | 'blocked' | 'off' | 'on';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function keyBytes(base64url: string): ArrayBuffer {
  const padded = `${base64url}${'='.repeat((4 - (base64url.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'unconfigured';
  if (Notification.permission === 'denied') return 'blocked';
  return (await currentSubscription()) ? 'on' : 'off';
}

export async function turnOnPush(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'unconfigured';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const registration = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
    }));
  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').insert({
    player_id: playerId,
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    user_agent: navigator.userAgent.slice(0, 200),
  });
  // Already stored for this device: nothing to do.
  if (error && error.code !== '23505') throw error;
  return 'on';
}

export async function turnOffPush(supabase: SupabaseClient<Database>): Promise<PushState> {
  const subscription = await currentSubscription();
  if (subscription) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint);
    if (error) throw error;
    await subscription.unsubscribe();
  }
  return 'off';
}
