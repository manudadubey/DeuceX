import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { BillingActionsDb, BillingStripeClient } from '@deucex/actions/billing';
import { registerBillingRoutes, type BillingRoutesDeps } from './routes';

const signedIn = {
  auth: { getUser: async () => ({ data: { user: { id: 'player-1' } }, error: null }) },
} as unknown as SupabaseClient<Database>;

function stripeSpy(): BillingStripeClient {
  return {
    createCustomer: vi.fn(),
    findPriceByLookupKey: vi.fn(),
    createPlanCheckoutSession: vi.fn(),
    retrievePlanCheckoutSession: vi.fn(),
    retrievePlanSubscription: vi.fn(),
    cancelPlanSubscription: vi.fn(),
  };
}

function deps(overrides: Partial<BillingRoutesDeps> = {}): BillingRoutesDeps {
  return {
    anonClient: signedIn,
    gateDb: { getApproval: async () => null, claimApproval: async () => true },
    billing: {} as BillingActionsDb,
    stripe: stripeSpy(),
    appBaseUrl: 'https://app.test',
    ...overrides,
  };
}

async function build(d: BillingRoutesDeps) {
  const app = Fastify();
  await app.register(async (instance) => {
    await registerBillingRoutes(instance, d);
  });
  return app;
}

const auth = { authorization: 'Bearer token' };

describe('billing routes', () => {
  it('needs a signed-in player', async () => {
    const app = await build(deps());
    const res = await app.inject({ method: 'POST', url: '/billing/checkout', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('answers 503 without Stripe, never pretending', async () => {
    const app = await build(deps({ stripe: null }));
    for (const url of ['/billing/checkout', '/billing/checkout/complete', '/billing/cancel']) {
      const res = await app.inject({ method: 'POST', url, headers: auth, payload: {} });
      expect(res.statusCode).toBe(503);
    }
  });

  it('refuses a checkout with no approval behind it, before any Stripe call', async () => {
    const stripe = stripeSpy();
    const app = await build(deps({ stripe }));
    const res = await app.inject({
      method: 'POST',
      url: '/billing/checkout',
      headers: auth,
      payload: { approvalId: 'approval-1', plan: 'pro', cycle: 'annual' },
    });
    expect(res.statusCode).toBe(400);
    expect(stripe.createPlanCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects an unknown plan or cycle', async () => {
    const app = await build(deps());
    const res = await app.inject({
      method: 'POST',
      url: '/billing/checkout',
      headers: auth,
      payload: { approvalId: 'approval-1', plan: 'platinum', cycle: 'annual' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('refuses a cancel with no approval behind it', async () => {
    const stripe = stripeSpy();
    const app = await build(deps({ stripe }));
    const res = await app.inject({
      method: 'POST',
      url: '/billing/cancel',
      headers: auth,
      payload: { approvalId: 'approval-2' },
    });
    expect(res.statusCode).toBe(400);
    expect(stripe.cancelPlanSubscription).not.toHaveBeenCalled();
  });
});
