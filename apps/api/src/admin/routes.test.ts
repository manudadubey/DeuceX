import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { AdminRole } from '@deucex/shared';
import type { ConsoleDb, ConsoleQuery } from './console-db';
import { registerAdminRoutes, type AdminRoutesDeps } from './routes';
import { ConsoleAdminGateDb } from './audit';
import { sessionUsedPasskey } from './staff-auth';

// Route-level checks for step 5.1's acceptance criteria, against an
// in-memory console database. The live grant checks (the console role
// can't read notes.transcript) are in packages/db's RLS integration tests.

function token(amr: string[]): string {
  const payload = Buffer.from(JSON.stringify({ amr: amr.map((method) => ({ method })) })).toString(
    'base64url',
  );
  return `header.${payload}.signature`;
}

const PASSKEY_TOKEN = token(['passkey']);
const MAGIC_LINK_TOKEN = token(['otp']);

interface FakeState {
  staff: Record<string, { id: string; name: string; email: string; role: AdminRole }>;
  player: {
    id: string;
    name: string;
    email: string;
    tour: string;
    country: string;
    tier: string | null;
    tier_status: string | null;
    trial_ends_at: string | null;
    verification: string;
    tour_player_id: string | null;
    itf_id: string | null;
    deletion_effective_at: string | null;
    comp_tier: string | null;
  };
  adminActions: Array<{
    id: string;
    player_id: string | null;
    action_type: string;
    consequence: string;
    reason: string | null;
    role_at_time: string;
    admin_id: string;
  }>;
  consumptions: Set<string>;
  notifications: Array<{ player_id: string; title: string }>;
  playerUpdates: string[];
}

function fakeConsoleDb(state: FakeState, userIdByToken: Map<string, string>): ConsoleDb {
  let seq = 0;
  const q: ConsoleQuery = {
    async query(text: string, params: unknown[] = []) {
      const sql = text.replace(/\s+/g, ' ');
      const result = (rows: unknown[], rowCount = rows.length) => ({ rows, rowCount }) as never;

      if (sql.includes('from public.admin_users where id = $1')) {
        const s = Object.values(state.staff).find((x) => x.id === params[0]);
        return result(s ? [s] : []);
      }
      if (sql.includes('from public.players where id = $1')) {
        return result(params[0] === state.player.id ? [state.player] : []);
      }
      if (sql.startsWith(' update public.players') || sql.startsWith('update public.players')) {
        state.playerUpdates.push(sql);
        if (sql.includes('deletion_effective_at = $3')) {
          state.player.deletion_effective_at = params[2] as string;
        }
        if (sql.includes('trial_ends_at = $2')) state.player.trial_ends_at = params[1] as string;
        return result([], 1);
      }
      if (sql.includes('insert into public.admin_actions')) {
        const id = `aa-${++seq}`;
        state.adminActions.push({
          id,
          admin_id: params[0] as string,
          role_at_time: params[2] as string,
          player_id: params[3] as string | null,
          action_type: params[4] as string,
          consequence: params[6] as string,
          reason: params[7] as string | null,
        });
        return result([{ id }]);
      }
      if (sql.includes('from public.admin_actions where id = $1')) {
        const a = state.adminActions.find((x) => x.id === params[0]);
        return result(a ? [a] : []);
      }
      if (sql.includes('insert into public.admin_action_consumptions')) {
        const id = params[0] as string;
        if (state.consumptions.has(id)) return result([], 0);
        state.consumptions.add(id);
        return result([], 1);
      }
      if (sql.includes('insert into public.notifications')) {
        state.notifications.push({ player_id: params[0] as string, title: params[1] as string });
        return result([], 1);
      }
      if (sql.includes('update public.admin_users')) return result([], 1);
      throw new Error(`fake console db: unhandled query: ${sql.slice(0, 80)}`);
    },
  };
  void userIdByToken;
  return { tx: (fn) => fn(q), end: async () => undefined };
}

function setup(options: { passkeys?: number; requirePasskey?: boolean } = {}) {
  const state: FakeState = {
    staff: {
      support: { id: 'staff-support', name: 'Sam Park', email: 'sam@deucex.test', role: 'support' },
      owner: { id: 'staff-owner', name: 'Olive Owner', email: 'olive@deucex.test', role: 'owner' },
    },
    player: {
      id: 'player-1',
      name: 'Arya Dubey',
      email: 'arya@example.test',
      tour: 'wta',
      country: 'AU',
      tier: 'pro',
      tier_status: 'trialing',
      trial_ends_at: '2026-10-01T00:00:00.000Z',
      verification: 'verified',
      tour_player_id: null,
      itf_id: null,
      deletion_effective_at: null,
      comp_tier: null,
    },
    adminActions: [],
    consumptions: new Set(),
    notifications: [],
    playerUpdates: [],
  };

  // Each staff member signs in with a token naming who they are.
  const tokens = new Map<string, string>([
    [`support-${PASSKEY_TOKEN}`, 'staff-support'],
    [`owner-${PASSKEY_TOKEN}`, 'staff-owner'],
    [`owner-${MAGIC_LINK_TOKEN}`, 'staff-owner'],
  ]);
  const consoleDb = fakeConsoleDb(state, tokens);
  const sendEmail = vi.fn(async () => ({ id: 'email-1' }));
  const anonClient = {
    auth: {
      async getUser(t: string) {
        const id = tokens.get(t);
        return id
          ? { data: { user: { id } }, error: null }
          : { data: { user: null }, error: new Error('bad') };
      },
    },
  };
  const passkeyAdmin = {
    auth: {
      admin: {
        passkey: {
          listPasskeys: async () => ({
            data: Array.from({ length: options.passkeys ?? 1 }, (_, i) => ({ id: `pk-${i}` })),
            error: null,
          }),
        },
        generateLink: async () => ({ data: { properties: { hashed_token: 'hash' } }, error: null }),
      },
    },
  };

  const deps = {
    auth: { anonClient, passkeyAdmin, consoleDb, requirePasskey: options.requirePasskey ?? true },
    consoleDb,
    gateDb: new ConsoleAdminGateDb(consoleDb),
    email: { sendEmail },
    staffEmail: { sendEmail },
    authAdmin: passkeyAdmin,
    passkeyAdmin,
    exportDb: {} as never,
    ranking: { lookup: vi.fn() },
    actionsBoss: null,
    appBaseUrl: 'https://deucex.vercel.app',
    adminBaseUrl: 'https://admin.deucex.test',
    platformPool: {} as never,
    now: () => new Date('2026-09-27T09:00:00.000Z'),
  } as unknown as AdminRoutesDeps;

  const app = Fastify();
  void app.register(async (instance) => {
    await registerAdminRoutes(instance, deps);
  });
  const as = (who: 'support' | 'owner', t = PASSKEY_TOKEN) => ({
    authorization: `Bearer ${who}-${t}`,
  });
  return { app, state, sendEmail, as };
}

describe('staff sessions', () => {
  it('reads a passkey sign-in from the access token amr claim', () => {
    expect(sessionUsedPasskey(PASSKEY_TOKEN)).toBe(true);
    expect(sessionUsedPasskey(MAGIC_LINK_TOKEN)).toBe(false);
    expect(sessionUsedPasskey('not-a-jwt')).toBe(false);
  });

  it('refuses a request with no session', async () => {
    const { app } = setup();
    const res = await app.inject({ method: 'GET', url: '/admin/players/player-1' });
    expect(res.statusCode).toBe(401);
  });

  it('refuses a magic-link-only session once a passkey exists', async () => {
    const { app, as } = setup();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/players/player-1',
      headers: as('owner', MAGIC_LINK_TOKEN),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('passkey_sign_in_required');
  });

  it('accepts an email-link session with no passkey when the requirement is off (development only)', async () => {
    const { app, as } = setup({ passkeys: 0, requirePasskey: false });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/money',
      headers: as('owner', MAGIC_LINK_TOKEN),
    });
    expect(res.statusCode).not.toBe(403);
    const support = await app.inject({
      method: 'GET',
      url: '/admin/money',
      headers: as('support'),
    });
    expect(support.statusCode).toBe(403);
  });

  it('asks for enrolment before a passkey exists', async () => {
    const { app, as } = setup({ passkeys: 0 });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/players/player-1',
      headers: as('owner'),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('passkey_enrolment_required');
  });
});

describe('role boundaries (AD-AC-1)', () => {
  it('refuses Money to support by URL, whatever the UI shows', async () => {
    const { app, as } = setup();
    const res = await app.inject({ method: 'GET', url: '/admin/money', headers: as('support') });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('forbidden_area');
  });

  it('refuses Agent health and Ingestion areas to support', async () => {
    const { app, as } = setup();
    for (const url of ['/admin/agents', '/admin/routing']) {
      const res = await app.inject({ method: 'GET', url, headers: as('support') });
      expect(res.statusCode).toBe(403);
    }
  });

  it('lets a role preview narrow the owner to support', async () => {
    const { app, as } = setup();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/money',
      headers: { ...as('owner'), 'x-role-preview': 'support' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses owner-only account actions to support', async () => {
    const { app, as, state } = setup();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/players/player-1/actions/delete_account',
      headers: as('support'),
      payload: { reason: 'Asked by email' },
    });
    expect(res.statusCode).toBe(403);
    expect(state.adminActions).toHaveLength(0);
  });
});

describe('account actions', () => {
  it('refuses a delete without a reason and changes nothing (AD-AC-3)', async () => {
    const { app, as, state, sendEmail } = setup();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/players/player-1/actions/delete_account',
      headers: as('owner'),
      payload: { reason: '   ' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/reason/i);
    expect(state.player.deletion_effective_at).toBeNull();
    expect(state.adminActions).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('with a reason, schedules deletion 14 days out, audits it and emails the player at once', async () => {
    const { app, as, state, sendEmail } = setup();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/players/player-1/actions/delete_account',
      headers: as('owner'),
      payload: { reason: 'Player asked by email on 26 September' },
    });
    expect(res.statusCode).toBe(200);
    expect(state.player.deletion_effective_at).toBe('2026-10-11T09:00:00.000Z');
    expect(state.adminActions).toEqual([
      expect.objectContaining({
        player_id: 'player-1',
        action_type: 'delete_account',
        role_at_time: 'owner',
        reason: 'Player asked by email on 26 September',
        consequence: expect.stringContaining('Sun 11 Oct 2026'),
      }),
    ]);
    expect(state.consumptions.has(state.adminActions[0]!.id)).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'arya@example.test' }));
  });

  it('extends a trial with the new date in the consequence, audits it and notifies the player (AD-AC-2)', async () => {
    const { app, as, state } = setup();
    const preview = await app.inject({
      method: 'POST',
      url: '/admin/players/player-1/actions/trial_extend/preview',
      headers: as('support'),
    });
    expect(preview.json().consequence).toContain('Thu 15 Oct 2026');

    const res = await app.inject({
      method: 'POST',
      url: '/admin/players/player-1/actions/trial_extend',
      headers: as('support'),
      payload: { reason: 'Travelling during the trial' },
    });
    expect(res.statusCode).toBe(200);
    expect(state.player.trial_ends_at).toBe('2026-10-15T00:00:00.000Z');
    expect(state.adminActions[0]).toMatchObject({
      action_type: 'trial_extend',
      role_at_time: 'support',
      admin_id: 'staff-support',
      reason: 'Travelling during the trial',
      consequence: preview.json().consequence,
    });
    expect(state.notifications).toEqual([
      { player_id: 'player-1', title: 'Your Pro trial was extended' },
    ]);
  });
});
