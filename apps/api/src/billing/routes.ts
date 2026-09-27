import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import {
  ApprovalActionMismatchError,
  ApprovalAlreadyConsumedError,
  ApprovalNotFoundError,
  ApprovalPayloadMismatchError,
  type ApprovalGateDb,
} from '@deucex/actions';
import {
  AlreadySubscribedError,
  CheckoutNotYoursError,
  NoSubscriptionError,
  PlanChangeUnavailableError,
  PlanPriceMissingError,
  cancelPlan,
  completeSubscriptionCheckout,
  startSubscriptionCheckout,
  type BillingActionsDb,
  type BillingStripeClient,
} from '@deucex/actions/billing';
import { isBillingCycle, isPaidPlan } from '@deucex/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest, UnauthorizedError } from '../auth';

export interface BillingRoutesDeps {
  anonClient: SupabaseClient<Database>;
  gateDb: ApprovalGateDb;
  billing: BillingActionsDb;
  /** Null without STRIPE_SECRET_KEY: every route answers 503 rather than pretending. */
  stripe: BillingStripeClient | null;
  appBaseUrl: string;
}

async function requirePlayerId(
  deps: BillingRoutesDeps,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | undefined> {
  try {
    return await authenticateRequest(deps.anonClient, request.headers.authorization);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      await reply.code(401).send({ error: err.message });
      return undefined;
    }
    throw err;
  }
}

function sendBillingError(reply: FastifyReply, err: unknown): boolean {
  if (
    err instanceof ApprovalNotFoundError ||
    err instanceof ApprovalActionMismatchError ||
    err instanceof ApprovalPayloadMismatchError
  ) {
    void reply.code(400).send({ error: err.message });
    return true;
  }
  if (err instanceof ApprovalAlreadyConsumedError || err instanceof AlreadySubscribedError) {
    void reply.code(409).send({ error: err.message });
    return true;
  }
  if (err instanceof CheckoutNotYoursError) {
    void reply.code(403).send({ error: err.message });
    return true;
  }
  if (err instanceof NoSubscriptionError || err instanceof PlanChangeUnavailableError) {
    void reply.code(422).send({ error: err.message });
    return true;
  }
  if (err instanceof PlanPriceMissingError) {
    void reply.code(503).send({ error: 'Plan prices are not set up in Stripe yet.' });
    return true;
  }
  return false;
}

// A player's own plan (docs/BILLING-DECISIONS.md). Starting a trial and
// dropping a card-less trial to Free need no API (the start_trial and
// downgrade_to_free database functions); these three are the ones that
// reach Stripe.
export async function registerBillingRoutes(
  app: FastifyInstance,
  deps: BillingRoutesDeps,
): Promise<void> {
  app.post('/billing/checkout', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    if (!deps.stripe) return reply.code(503).send({ error: 'Stripe is not configured' });
    const { approvalId, plan, cycle } = request.body as {
      approvalId?: string;
      plan?: unknown;
      cycle?: unknown;
    };
    if (!approvalId) return reply.code(400).send({ error: 'Missing approvalId' });
    if (!isPaidPlan(plan) || !isBillingCycle(cycle)) {
      return reply.code(400).send({ error: 'plan must be pro or elite, cycle monthly or annual' });
    }
    try {
      const result = await startSubscriptionCheckout(deps.gateDb, deps.billing, deps.stripe, {
        approvalId,
        playerId,
        plan,
        cycle,
        appBaseUrl: deps.appBaseUrl,
      });
      return reply.send(result);
    } catch (err) {
      if (sendBillingError(reply, err)) return;
      throw err;
    }
  });

  app.post('/billing/checkout/complete', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    if (!deps.stripe) return reply.code(503).send({ error: 'Stripe is not configured' });
    const { sessionId } = request.body as { sessionId?: string };
    if (!sessionId) return reply.code(400).send({ error: 'Missing sessionId' });
    try {
      return reply.send(
        await completeSubscriptionCheckout(deps.billing, deps.stripe, { playerId, sessionId }),
      );
    } catch (err) {
      if (sendBillingError(reply, err)) return;
      throw err;
    }
  });

  app.post('/billing/cancel', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    if (!deps.stripe) return reply.code(503).send({ error: 'Stripe is not configured' });
    const { approvalId } = request.body as { approvalId?: string };
    if (!approvalId) return reply.code(400).send({ error: 'Missing approvalId' });
    try {
      return reply.send(
        await cancelPlan(deps.gateDb, deps.billing, deps.stripe, { approvalId, playerId }),
      );
    } catch (err) {
      if (sendBillingError(reply, err)) return;
      throw err;
    }
  });
}
