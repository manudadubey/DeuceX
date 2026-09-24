import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import {
  ApprovalActionMismatchError,
  ApprovalAlreadyConsumedError,
  ApprovalNotFoundError,
  ApprovalPayloadMismatchError,
  SupabaseApprovalGateDb,
  type AgentRunsDb,
} from '@procircuit/actions';
import type { EmailClient } from '@procircuit/actions/account';
import {
  createPatronCheckout,
  FansProgrammeMissingError,
  InvalidTierInputError,
  inviteFromWaitlist,
  PatronHasNoEmailError,
  PatronNotFoundError,
  publishTier,
  sendPatronNote,
  startConnectOnboarding,
  StripeCallFailedError,
  SupabaseFansActionsDb,
  TierNotSellableError,
  WaitlistEntryUnavailableError,
  type FansStripeClient,
  type PatronNoteKind,
} from '@procircuit/actions/fans';
import type { PatronNoteModelClient } from '@procircuit/agents';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest, UnauthorizedError } from '../auth';
import {
  applyJoinFromSession,
  applyStripeEvent,
  draftPatronNote,
  joinWaitlist,
  loadPublicPage,
  syncConnectAccount,
} from './service';
import type { FansStore } from './store';

export interface FansRoutesDeps {
  db: SupabaseClient<Database>;
  anonClient: SupabaseClient<Database>;
  store: FansStore;
  /** Null when STRIPE_SECRET_KEY is unset: every Stripe-backed route answers 503 rather than pretending. */
  stripe: FansStripeClient | null;
  /** Null when STRIPE_WEBHOOK_SECRET is unset: the webhook route answers 503. */
  webhookSecret: string | null;
  email: EmailClient;
  noteClient: PatronNoteModelClient;
  agentRuns: AgentRunsDb;
  appBaseUrl: string;
}

const NOTE_KINDS: readonly PatronNoteKind[] = ['thanks', 'nudge', 'checkin', 'welcome'];
const SOURCES = ['profile', 'draw', 'direct', 'unknown'] as const;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function requirePlayerId(
  deps: FansRoutesDeps,
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

function mapError(err: unknown, reply: FastifyReply): FastifyReply | undefined {
  if (
    err instanceof ApprovalNotFoundError ||
    err instanceof ApprovalActionMismatchError ||
    err instanceof ApprovalPayloadMismatchError ||
    err instanceof InvalidTierInputError
  ) {
    return reply.code(400).send({ error: err.message });
  }
  if (err instanceof ApprovalAlreadyConsumedError)
    return reply.code(409).send({ error: err.message });
  if (err instanceof PatronNotFoundError || err instanceof FansProgrammeMissingError) {
    return reply.code(404).send({ error: err.message });
  }
  if (
    err instanceof WaitlistEntryUnavailableError ||
    err instanceof TierNotSellableError ||
    err instanceof PatronHasNoEmailError
  ) {
    return reply.code(422).send({ error: err.message });
  }
  if (err instanceof StripeCallFailedError) return reply.code(502).send({ error: err.message });
  return undefined;
}

function stripeOr503(deps: FansRoutesDeps, reply: FastifyReply): FansStripeClient | undefined {
  if (!deps.stripe) {
    void reply.code(503).send({ error: 'Stripe is not configured on this server' });
    return undefined;
  }
  return deps.stripe;
}

// Three groups of routes: the player's own (bearer token, like every other
// module), the public patron page's (no session: a would-be patron has
// none, same trust model as /sharing/:token, and every response is a
// hand-built DTO), and Stripe's webhook (signature-verified raw body).
export async function registerFansRoutes(
  app: FastifyInstance,
  deps: FansRoutesDeps,
): Promise<void> {
  const gateDb = () => new SupabaseApprovalGateDb(deps.db);
  const actionsDb = () => new SupabaseFansActionsDb(deps.db);

  // ---- player routes ------------------------------------------------------

  app.post('/fans/connect/onboard', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const stripe = stripeOr503(deps, reply);
    if (!stripe) return;
    const { approvalId } = (request.body ?? {}) as { approvalId?: string };
    if (!approvalId) return reply.code(400).send({ error: 'Missing approvalId' });
    try {
      const result = await startConnectOnboarding(gateDb(), actionsDb(), stripe, {
        approvalId,
        playerId,
        appBaseUrl: deps.appBaseUrl,
      });
      return reply.send(result);
    } catch (err) {
      const mapped = mapError(err, reply);
      if (mapped) return mapped;
      throw err;
    }
  });

  // A read, not a side effect: re-pulls the account's KYC state when the
  // player comes back from Stripe's hosted onboarding, rather than waiting
  // for account.updated to arrive.
  app.post('/fans/connect/refresh', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const stripe = stripeOr503(deps, reply);
    if (!stripe) return;
    const programme = await deps.store.getProgramme(playerId);
    if (!programme) return reply.code(404).send({ error: 'No patron programme yet' });
    try {
      const kycStatus = await syncConnectAccount({ store: deps.store, stripe }, programme);
      return reply.send({ kycStatus });
    } catch (err) {
      const mapped = mapError(err, reply);
      if (mapped) return mapped;
      throw err;
    }
  });

  app.post('/fans/tiers', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const stripe = stripeOr503(deps, reply);
    if (!stripe) return;
    const body = (request.body ?? {}) as {
      approvalId?: string;
      position?: number;
      name?: string;
      price?: number;
      perks?: string;
    };
    if (
      !body.approvalId ||
      typeof body.position !== 'number' ||
      typeof body.name !== 'string' ||
      typeof body.price !== 'number'
    ) {
      return reply.code(400).send({ error: 'Missing approvalId, position, name or price' });
    }
    try {
      const result = await publishTier(gateDb(), actionsDb(), stripe, {
        approvalId: body.approvalId,
        playerId,
        position: body.position,
        name: body.name,
        price: body.price,
        perks: body.perks ?? '',
      });
      return reply.send(result);
    } catch (err) {
      const mapped = mapError(err, reply);
      if (mapped) return mapped;
      throw err;
    }
  });

  app.post('/fans/patrons/:id/draft', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const { id } = request.params as { id: string };
    const result = await draftPatronNote(
      { store: deps.store, noteClient: deps.noteClient, agentRuns: deps.agentRuns },
      playerId,
      id,
    );
    if (!result) return reply.code(404).send({ error: 'No such patron' });
    return reply.send(result);
  });

  app.post('/fans/patrons/:id/send', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      approvalId?: string;
      kind?: PatronNoteKind;
      text?: string;
      draftText?: string | null;
    };
    if (
      !body.approvalId ||
      !body.kind ||
      !NOTE_KINDS.includes(body.kind) ||
      typeof body.text !== 'string'
    ) {
      return reply.code(400).send({ error: 'Missing approvalId, kind or text' });
    }
    try {
      const result = await sendPatronNote(gateDb(), actionsDb(), deps.email, {
        approvalId: body.approvalId,
        playerId,
        patronId: id,
        kind: body.kind,
        text: body.text,
        draftText: body.draftText ?? null,
        device: request.headers['user-agent'] ?? null,
      });
      return reply.send(result);
    } catch (err) {
      const mapped = mapError(err, reply);
      if (mapped) return mapped;
      throw err;
    }
  });

  app.post('/fans/waitlist/:id/invite', async (request, reply) => {
    const playerId = await requirePlayerId(deps, request, reply);
    if (!playerId) return;
    const { id } = request.params as { id: string };
    const { approvalId } = (request.body ?? {}) as { approvalId?: string };
    if (!approvalId) return reply.code(400).send({ error: 'Missing approvalId' });
    try {
      const result = await inviteFromWaitlist(gateDb(), actionsDb(), deps.email, {
        approvalId,
        playerId,
        entryId: id,
        appBaseUrl: deps.appBaseUrl,
      });
      return reply.send(result);
    } catch (err) {
      const mapped = mapError(err, reply);
      if (mapped) return mapped;
      throw err;
    }
  });

  // ---- public patron page (no session) -----------------------------------

  app.get('/public/p/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const page = await loadPublicPage({ store: deps.store }, slug);
    if (!page) return reply.code(404).send({ error: 'No patron page here' });
    return reply.send(page);
  });

  app.post('/public/p/:slug/checkout', async (request, reply) => {
    const stripe = stripeOr503(deps, reply);
    if (!stripe) return;
    const { slug } = request.params as { slug: string };
    const body = (request.body ?? {}) as { tierId?: string; source?: string; namesOptIn?: boolean };
    if (!body.tierId) return reply.code(400).send({ error: 'Missing tierId' });
    const source = SOURCES.find((s) => s === body.source) ?? 'unknown';
    try {
      const result = await createPatronCheckout(actionsDb(), stripe, {
        slug,
        tierId: body.tierId,
        source,
        namesOptIn: body.namesOptIn === true,
        appBaseUrl: deps.appBaseUrl,
      });
      return reply.send(result);
    } catch (err) {
      const mapped = mapError(err, reply);
      if (mapped) return mapped;
      throw err;
    }
  });

  app.post('/public/p/:slug/waitlist', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { email } = (request.body ?? {}) as { email?: string };
    if (!email || !EMAIL_PATTERN.test(email.trim()) || email.length > 254) {
      return reply.code(400).send({ error: 'Enter a valid email address' });
    }
    const result = await joinWaitlist({ store: deps.store }, slug, email);
    if (!result.ok) return reply.code(404).send({ error: 'No patron page here' });
    return reply.send(result);
  });

  // The thank-you page's reconcile: the same idempotent join the webhook
  // applies, so a patron shows up even when the webhook is delayed (or, in
  // local development, not forwarded at all). Returns only what the
  // thank-you page itself prints.
  app.post('/public/p/:slug/complete', async (request, reply) => {
    const stripe = stripeOr503(deps, reply);
    if (!stripe) return;
    const { slug } = request.params as { slug: string };
    const { sessionId } = (request.body ?? {}) as { sessionId?: string };
    if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      return reply.code(400).send({ error: 'Missing sessionId' });
    }
    const programme = await deps.store.getProgrammeBySlug(slug);
    if (!programme?.stripeAccountId) return reply.code(404).send({ error: 'No patron page here' });
    try {
      const session = await stripe.retrieveCheckoutSession({
        account: programme.stripeAccountId,
        id: sessionId,
      });
      const joined = await applyJoinFromSession(
        { store: deps.store, stripe },
        programme,
        session,
        null,
      );
      if (!joined) return reply.code(409).send({ error: 'Checkout is not complete yet' });
      return reply.send({
        tierName: joined.tier.name,
        firstName: joined.patron.name.split(/\s+/)[0],
      });
    } catch (err) {
      const mapped = mapError(err, reply);
      if (mapped) return mapped;
      throw err;
    }
  });

  // ---- Stripe webhook -----------------------------------------------------

  await app.register(async (hook) => {
    // Signature verification needs the exact bytes Stripe sent, so this
    // encapsulated scope parses JSON as a raw Buffer instead of an object.
    hook.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body);
    });

    hook.post('/webhooks/stripe', async (request, reply) => {
      if (!deps.stripe || !deps.webhookSecret) {
        return reply.code(503).send({ error: 'Stripe webhooks are not configured on this server' });
      }
      const signature = request.headers['stripe-signature'];
      if (typeof signature !== 'string')
        return reply.code(400).send({ error: 'Missing signature' });
      let event;
      try {
        event = deps.stripe.verifyWebhook(request.body as Buffer, signature, deps.webhookSecret);
      } catch {
        return reply.code(400).send({ error: 'Invalid signature' });
      }
      const outcome = await applyStripeEvent({ store: deps.store, stripe: deps.stripe }, event);
      return reply.send({ received: true, outcome });
    });
  });
}
