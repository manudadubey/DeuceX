import webpush from 'web-push';

// The only file in this codebase allowed to `import 'web-push'` (root
// eslint.config.mjs, proven by lint-rule.test.ts). Step 5.2: Web Push to a
// player's own browser or installed PWA (owner decision 26 September 2026;
// native push arrives with step 5.3's Capacitor apps behind the same
// PushClient interface). VAPID keys are generated once and live only in the
// environment, never in this repo.

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushClient {
  /** `gone` means the browser dropped the subscription (404 or 410): stop sending to it. */
  send(subscription: PushSubscriptionKeys, payload: string): Promise<{ gone: boolean }>;
}

export class PushSendFailedError extends Error {
  constructor(reason: string) {
    super(`Web Push failed: ${reason}`);
    this.name = 'PushSendFailedError';
  }
}

export function createWebPushClient(config: {
  publicKey: string;
  privateKey: string;
  /** A mailto: or https: contact the push services can reach. */
  subject: string;
}): PushClient {
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return {
    async send(subscription, payload) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 24 * 60 * 60 },
        );
        return { gone: false };
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return { gone: true };
        throw new PushSendFailedError(
          error instanceof Error ? error.message : String(error ?? 'unknown'),
        );
      }
    },
  };
}
