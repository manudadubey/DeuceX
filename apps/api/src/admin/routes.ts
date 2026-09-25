import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { sendStaffSignInLink, type EmailClient } from '@deucex/actions/account';
import type { PlatformBalanceLineMinor } from '@deucex/actions/fans';
import { adminAreas, canAccessArea, type AdminArea } from '@deucex/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import {
  AdminActionError,
  acknowledgeAlerts,
  dismissFailedRun,
  previewPlayerAction,
  resolveCase,
  retryFailedRun,
  runPlayerAction,
  saveRouting,
  setAgentPaused,
  setProviderState,
  type AdminActionDeps,
  type CaseOutcome,
} from './actions';
import { runNightlyAggregation } from './aggregation';
import type { RequestMeta } from './audit';
import { PLAYER_ACTION_TYPES, type PlayerActionType } from './consequences';
import {
  getAgentHealth,
  getMoney,
  getNavCounts,
  getOverview,
  getPlayerDetail,
  getRouting,
  getTrust,
  listAdminAudit,
  listAlerts,
  listPlayers,
} from './queries';
import {
  StaffAuthError,
  authenticateStaff,
  countPasskeys,
  type Staff,
  type StaffAuthDeps,
} from './staff-auth';

// The console API (PRD-13). Every route authenticates the staff member and
// checks the area their acting role holds before doing anything: the
// server is the real boundary, apps/admin hiding areas is a convenience
// (PRD-13 section 7, "Role visibility"). A support session asking for
// /admin/money gets a 403 here whatever the UI does.

export interface AdminRoutesDeps extends AdminActionDeps {
  auth: StaffAuthDeps;
  /** The platform's own connection for the nightly aggregation (not the console role). */
  platformPool: pg.Pool;
  /** Service-role client with passkeys on: sign-in links and passkey checks. */
  passkeyAdmin: SupabaseClient<Database>;
  adminBaseUrl: string;
  staffEmail: EmailClient;
  /** Read-only Stripe platform balance (AD-22); absent when Stripe isn't configured. */
  stripeBalance?: () => Promise<PlatformBalanceLineMinor[]>;
}

declare module 'fastify' {
  interface FastifyRequest {
    staff?: Staff;
  }
}

function meta(request: FastifyRequest): RequestMeta {
  const ua = request.headers['user-agent'];
  return { device: typeof ua === 'string' ? ua.slice(0, 200) : null, ip: request.ip ?? null };
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof StaffAuthError) {
    return reply.code(error.status).send({ error: error.message, code: error.code });
  }
  if (error instanceof AdminActionError)
    return reply.code(error.status).send({ error: error.message });
  throw error;
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  deps: AdminRoutesDeps,
): Promise<void> {
  async function staffFor(request: FastifyRequest, area: AdminArea | null): Promise<Staff> {
    const staff = await authenticateStaff(deps.auth, request.headers);
    if (area && !canAccessArea(staff.actingRole, area)) {
      throw new StaffAuthError(403, 'forbidden_area', 'Your role does not include this area.');
    }
    request.staff = staff;
    return staff;
  }

  const now = () => deps.now?.() ?? new Date();

  // --- Sign-in (unauthenticated; always the same answer, so it can't be used to probe for staff emails).
  app.post('/admin/auth/sign-in-link', async (request, reply) => {
    const body = request.body as { email?: string } | undefined;
    const email = body?.email?.trim().toLowerCase();
    if (!email) return reply.code(400).send({ error: 'Enter your staff email.' });
    const staff = await deps.consoleDb.tx(async (q) => {
      const { rows } = await q.query<{ id: string }>(
        `select id from public.admin_users where lower(email) = $1 and revoked_at is null`,
        [email],
      );
      return rows[0] ?? null;
    });
    if (staff) {
      const { data, error } = await deps.passkeyAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });
      if (!error && data.properties?.hashed_token) {
        await sendStaffSignInLink(deps.staffEmail, {
          to: email,
          signInUrl: `${deps.adminBaseUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`,
        });
      } else {
        request.log.error({ error }, 'staff sign-in link generation failed');
      }
    }
    return reply.send({ ok: true });
  });

  // Who am I, and what does my role see. Allowed before a passkey exists so
  // the console can show the enrolment step.
  app.get('/admin/me', async (request, reply) => {
    try {
      const staff = await authenticateStaff(deps.auth, request.headers, {
        allowWithoutPasskey: true,
      });
      let passkeyReady = staff.passkeys > 0;
      let passkeySession = false;
      try {
        await authenticateStaff(deps.auth, request.headers);
        passkeySession = true;
      } catch (error) {
        if (!(error instanceof StaffAuthError)) throw error;
        passkeyReady = staff.passkeys > 0;
      }
      if (passkeySession) {
        await deps.consoleDb.tx((q) =>
          q.query(`update public.admin_users set last_seen_at = now() where id = $1`, [staff.id]),
        );
      }
      return reply.send({
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        actingRole: staff.actingRole,
        areas: adminAreas(staff.actingRole),
        passkeyRegistered: passkeyReady,
        passkeySession,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/admin/auth/passkey-registered', async (request, reply) => {
    try {
      const staff = await authenticateStaff(deps.auth, request.headers, {
        allowWithoutPasskey: true,
      });
      const count = await countPasskeys(deps.passkeyAdmin, staff.id);
      if (count === 0) return reply.code(409).send({ error: 'No passkey is registered yet.' });
      await deps.consoleDb.tx((q) =>
        q.query(
          `update public.admin_users set passkey_registered_at = coalesce(passkey_registered_at, now()) where id = $1`,
          [staff.id],
        ),
      );
      return reply.send({ ok: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // --- Read models, one per area.
  const read = (
    path: string,
    area: AdminArea,
    load: (staff: Staff, request: FastifyRequest) => Promise<unknown>,
  ) =>
    app.get(path, async (request, reply) => {
      try {
        const staff = await staffFor(request, area);
        return reply.send(await load(staff, request));
      } catch (error) {
        return sendError(reply, error);
      }
    });

  read('/admin/nav-counts', 'overview', () => deps.consoleDb.tx((q) => getNavCounts(q, now())));
  read('/admin/overview', 'overview', (staff) =>
    deps.consoleDb.tx((q) => getOverview(q, staff.actingRole, now())),
  );
  read('/admin/players', 'players', (_staff, request) => {
    const query = request.query as { q?: string; tier?: string; status?: string };
    return deps.consoleDb.tx((q) => listPlayers(q, query, now()));
  });
  read('/admin/players/:id', 'players', async (_staff, request) => {
    const { id } = request.params as { id: string };
    const detail = await deps.consoleDb.tx((q) => getPlayerDetail(q, id, now()));
    if (!detail) throw new AdminActionError(404, 'No such player.');
    return detail;
  });
  read('/admin/agents', 'agents', (staff) =>
    deps.consoleDb.tx((q) => getAgentHealth(q, staff.actingRole, now())),
  );
  read('/admin/money', 'money', async () => {
    const money = await deps.consoleDb.tx((q) => getMoney(q, now()));
    return { ...money, reconciliation: await reconcile(deps, money.platformFeeAllTime) };
  });
  read('/admin/trust', 'trust', () => deps.consoleDb.tx((q) => getTrust(q, now())));
  read('/admin/alerts', 'overview', (staff) =>
    deps.consoleDb.tx((q) => listAlerts(q, staff.actingRole)),
  );
  read('/admin/audit', 'audit', (staff, request) => {
    const { admin } = request.query as { admin?: string };
    return deps.consoleDb.tx((q) => listAdminAudit(q, staff.id, staff.actingRole, admin));
  });
  read('/admin/routing', 'routing', () => deps.consoleDb.tx((q) => getRouting(q)));

  // --- Player actions: preview the consequence, then confirm.
  function parseAction(raw: string): PlayerActionType {
    if (!PLAYER_ACTION_TYPES.includes(raw as PlayerActionType)) {
      throw new AdminActionError(400, 'Unknown action.');
    }
    return raw as PlayerActionType;
  }

  app.post('/admin/players/:id/actions/:action/preview', async (request, reply) => {
    try {
      const staff = await staffFor(request, 'players');
      const { id, action } = request.params as { id: string; action: string };
      const body = (request.body ?? {}) as { linkId?: string };
      return reply.send(
        await previewPlayerAction(
          deps,
          staff,
          id,
          parseAction(action),
          body.linkId ? { linkId: body.linkId } : {},
        ),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/admin/players/:id/actions/:action', async (request, reply) => {
    try {
      const staff = await staffFor(request, 'players');
      const { id, action } = request.params as { id: string; action: string };
      const body = (request.body ?? {}) as { reason?: string; linkId?: string };
      return reply.send(
        await runPlayerAction(deps, staff, meta(request), id, parseAction(action), {
          reason: body.reason ?? null,
          ...(body.linkId ? { linkId: body.linkId } : {}),
        }),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // --- Agent health.
  app.post('/admin/agents/:name/pause', async (request, reply) => {
    try {
      const staff = await staffFor(request, 'agents');
      const { name } = request.params as { name: string };
      const body = (request.body ?? {}) as { paused?: boolean; reason?: string };
      return reply.send(
        await setAgentPaused(
          deps,
          staff,
          meta(request),
          decodeURIComponent(name),
          body.paused !== false,
          body.reason ?? null,
        ),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/admin/providers/:provider', async (request, reply) => {
    try {
      const staff = await staffFor(request, 'agents');
      const { provider } = request.params as { provider: string };
      const body = (request.body ?? {}) as { state?: 'on' | 'off'; reason?: string };
      if (body.state !== 'on' && body.state !== 'off')
        throw new AdminActionError(400, 'state must be on or off.');
      return reply.send(
        await setProviderState(
          deps,
          staff,
          meta(request),
          provider,
          body.state,
          body.reason ?? null,
        ),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/admin/runs/:id/retry', async (request, reply) => {
    try {
      const staff = await staffFor(request, 'agents');
      const { id } = request.params as { id: string };
      return reply.send(await retryFailedRun(deps, staff, meta(request), id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/admin/runs/:id/dismiss', async (request, reply) => {
    try {
      const staff = await staffFor(request, 'agents');
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { reason?: string };
      return reply.send(
        await dismissFailedRun(deps, staff, meta(request), id, body.reason ?? null),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/admin/aggregation/run', async (request, reply) => {
    try {
      await staffFor(request, 'agents');
      return reply.send(await runNightlyAggregation(deps.platformPool, now()));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // --- Trust and safety.
  app.post('/admin/cases/:id/resolve', async (request, reply) => {
    try {
      const staff = await staffFor(request, 'trust');
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { outcome?: CaseOutcome; reason?: string };
      if (!body.outcome) throw new AdminActionError(400, 'Choose an outcome.');
      return reply.send(
        await resolveCase(deps, staff, meta(request), id, body.outcome, body.reason ?? null),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // --- Alerts and routing.
  app.post('/admin/alerts/ack', async (request, reply) => {
    try {
      const staff = await staffFor(request, 'overview');
      const body = (request.body ?? {}) as { ids?: string[]; all?: boolean };
      await acknowledgeAlerts(deps, staff, body.all ? 'all' : (body.ids ?? []));
      return reply.send({ ok: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.put('/admin/routing', async (request, reply) => {
    try {
      const staff = await staffFor(request, 'routing');
      const body = (request.body ?? {}) as {
        routes?: Array<{ role: string; alertKind: string; push: boolean; email: boolean }>;
      };
      await saveRouting(deps, staff, meta(request), body.routes ?? []);
      return reply.send({ ok: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}

// AD-22: the platform's Stripe balance against the platform fees recorded
// on payouts, per currency. Read-only; a mismatch is shown, never fixed here.
async function reconcile(
  deps: AdminRoutesDeps,
  fees: Array<{ currency: string; fee: number }>,
): Promise<{
  checkedAt: string;
  lines: Array<{ currency: string; stripeMinor: number; ledgerMinor: number; matched: boolean }>;
  error: string | null;
}> {
  const checkedAt = new Date().toISOString();
  if (!deps.stripeBalance)
    return { checkedAt, lines: [], error: 'Stripe is not configured in this environment.' };
  try {
    const balance = await deps.stripeBalance();
    const currencies = new Set([
      ...balance.map((b) => b.currency),
      ...fees.map((f) => f.currency.toUpperCase()),
    ]);
    return {
      checkedAt,
      error: null,
      lines: [...currencies].map((currency) => {
        const b = balance.find((x) => x.currency === currency);
        const stripeMinor = b ? b.availableMinor + b.pendingMinor : 0;
        const ledgerMinor = Math.round(
          (fees.find((f) => f.currency.toUpperCase() === currency)?.fee ?? 0) * 100,
        );
        return { currency, stripeMinor, ledgerMinor, matched: stripeMinor === ledgerMinor };
      }),
    };
  } catch (error) {
    return { checkedAt, lines: [], error: error instanceof Error ? error.message : String(error) };
  }
}
