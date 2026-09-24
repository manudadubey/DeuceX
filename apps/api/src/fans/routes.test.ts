import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { FansStripeClient } from '@procircuit/actions/fans';
import { createMockPatronNoteClient } from '@procircuit/agents';
import { MemoryFansStore } from './memory-store';
import { registerFansRoutes, type FansRoutesDeps } from './routes';

const unusedClient = {} as SupabaseClient<Database>;

function deps(overrides: Partial<FansRoutesDeps> = {}): FansRoutesDeps {
  return {
    db: unusedClient,
    anonClient: unusedClient,
    store: new MemoryFansStore(),
    stripe: null,
    webhookSecret: null,
    email: { async sendEmail() {} },
    noteClient: createMockPatronNoteClient(),
    agentRuns: { async insertAgentRun() {} },
    appBaseUrl: 'https://app.test',
    ...overrides,
  };
}

async function build(d: FansRoutesDeps) {
  const app = Fastify();
  await app.register(async (instance) => {
    await registerFansRoutes(instance, d);
  });
  return app;
}

describe('fans routes', () => {
  it('answers 503 on the webhook when Stripe is not configured, never pretending', async () => {
    const app = await build(deps());
    const res = await app.inject({ method: 'POST', url: '/webhooks/stripe', payload: {} });
    expect(res.statusCode).toBe(503);
  });

  it('refuses a webhook whose signature does not verify, and passes the raw bytes to the check', async () => {
    let seen: unknown;
    const stripe = {
      verifyWebhook(raw: Buffer) {
        seen = raw;
        throw new Error('bad signature');
      },
    } as unknown as FansStripeClient;
    const app = await build(deps({ stripe, webhookSecret: 'whsec_test' }));
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=abc' },
      payload: '{"id":"evt_1"}',
    });
    expect(res.statusCode).toBe(400);
    expect(Buffer.isBuffer(seen)).toBe(true);
    expect((seen as Buffer).toString()).toBe('{"id":"evt_1"}');
  });

  it('404s an unknown public page and rejects a malformed waitlist email', async () => {
    const app = await build(deps());
    expect((await app.inject({ method: 'GET', url: '/public/p/nobody' })).statusCode).toBe(404);
    const res = await app.inject({
      method: 'POST',
      url: '/public/p/nobody/waitlist',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires a session for every player route', async () => {
    const anonClient = {
      auth: {
        async getUser() {
          return { data: { user: null }, error: new Error('no') };
        },
      },
    } as unknown as SupabaseClient<Database>;
    const app = await build(deps({ anonClient }));
    for (const url of [
      '/fans/connect/onboard',
      '/fans/tiers',
      '/fans/patrons/x/draft',
      '/fans/patrons/x/send',
      '/fans/waitlist/x/invite',
    ]) {
      const res = await app.inject({ method: 'POST', url, payload: {} });
      expect(res.statusCode, url).toBe(401);
    }
  });
});
