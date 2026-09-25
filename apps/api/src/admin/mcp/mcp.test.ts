import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { AdminRole } from '@deucex/shared';
import { ConsoleAdminGateDb } from '../audit';
import type { ConsoleDb, ConsoleQuery } from '../console-db';
import { createMcpToken, hashMcpToken, revokeMcpToken } from '../mcp-tokens';
import { listAdminAudit } from '../queries';
import { ConfirmationTokens } from './confirmation';
import { registerAdminMcpRoutes } from './server';
import { listToolsFor, type AdminMcpDeps } from './tools';

// Step 5.0's acceptance checks, end to end over the real MCP transport
// (JSON-RPC over POST /mcp) against an in-memory console database:
// - a support identity cannot call an owner tool;
// - a delete tool without a reason is refused;
// - every call appears in the admin audit log, as mcp.

const NOW = new Date('2026-09-28T09:00:00.000Z');
const PLAYER_ID = '11111111-1111-4111-8111-111111111111';

interface AuditRow {
  id: string;
  admin_id: string;
  admin_name: string;
  role_at_time: string;
  player_id: string | null;
  action_type: string;
  target: Record<string, unknown> | null;
  consequence: string;
  reason: string | null;
  via: string;
}

interface Token {
  id: string;
  admin_id: string;
  label: string;
  token_hash: string;
  revoked_at: string | null;
  expires_at: string;
}

function setup() {
  const staff: Record<string, { id: string; name: string; email: string; role: AdminRole }> = {
    'staff-support': {
      id: 'staff-support',
      name: 'Sam Park',
      email: 'sam@deucex.test',
      role: 'support',
    },
    'staff-owner': {
      id: 'staff-owner',
      name: 'Olive Owner',
      email: 'olive@deucex.test',
      role: 'owner',
    },
  };
  const revokedStaff = new Set<string>();
  const player = {
    id: PLAYER_ID,
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
    deletion_effective_at: null as string | null,
    comp_tier: null,
  };
  const audit: AuditRow[] = [];
  const tokens: Token[] = [];
  const consumptions = new Set<string>();
  const notifications: string[] = [];
  const playerUpdates: string[] = [];
  let seq = 0;

  const q: ConsoleQuery = {
    async query(text: string, params: unknown[] = []) {
      const sql = text.replace(/\s+/g, ' ').trim();
      const result = (rows: unknown[], rowCount = rows.length) => ({ rows, rowCount }) as never;

      if (sql.startsWith('update public.admin_mcp_tokens t set last_used_at')) {
        const t = tokens.find(
          (x) =>
            x.token_hash === params[0] &&
            !x.revoked_at &&
            new Date(x.expires_at) > NOW &&
            !revokedStaff.has(x.admin_id),
        );
        const s = t ? staff[t.admin_id] : undefined;
        return result(t && s ? [{ token_id: t.id, ...s }] : []);
      }
      if (sql.startsWith('insert into public.admin_mcp_tokens')) {
        const id = `tok-${++seq}`;
        tokens.push({
          id,
          admin_id: params[0] as string,
          label: params[1] as string,
          token_hash: params[2] as string,
          revoked_at: null,
          expires_at: params[5] as string,
        });
        return result([{ id }]);
      }
      if (sql.startsWith('update public.admin_mcp_tokens set revoked_at')) {
        const t = tokens.find(
          (x) => x.id === params[0] && x.admin_id === params[1] && !x.revoked_at,
        );
        if (!t) return result([]);
        t.revoked_at = NOW.toISOString();
        return result([{ label: t.label }]);
      }
      if (sql.includes('insert into public.admin_actions')) {
        const id = `aa-${++seq}`;
        audit.push({
          id,
          admin_id: params[0] as string,
          admin_name: params[1] as string,
          role_at_time: params[2] as string,
          player_id: params[3] as string | null,
          action_type: params[4] as string,
          target: params[5] ? JSON.parse(params[5] as string) : null,
          consequence: params[6] as string,
          reason: params[7] as string | null,
          via: params[11] as string,
        });
        return result([{ id }]);
      }
      if (sql.includes('from public.admin_actions where id = $1')) {
        const a = audit.find((x) => x.id === params[0]);
        return result(a ? [a] : []);
      }
      if (sql.includes('insert into public.admin_action_consumptions')) {
        const id = params[0] as string;
        if (consumptions.has(id)) return result([], 0);
        consumptions.add(id);
        return result([], 1);
      }
      if (sql.includes('from public.players where id = $1')) {
        return result(params[0] === player.id ? [player] : []);
      }
      if (sql.startsWith('update public.players')) {
        playerUpdates.push(sql);
        if (sql.includes('deletion_effective_at = $3'))
          player.deletion_effective_at = params[2] as string;
        if (sql.includes('trial_ends_at = $2')) player.trial_ends_at = params[1] as string;
        return result([], 1);
      }
      if (sql.includes('insert into public.notifications')) {
        notifications.push(params[1] as string);
        return result([], 1);
      }
      throw new Error(`fake console db: unhandled query: ${sql.slice(0, 90)}`);
    },
  };
  const consoleDb: ConsoleDb = {
    tx: (fn) => fn(q),
    read: (fn) => fn(q),
    end: async () => undefined,
  };
  const sendEmail = vi.fn(async () => ({ id: 'email-1' }));

  const deps = {
    consoleDb,
    gateDb: new ConsoleAdminGateDb(consoleDb),
    email: { sendEmail },
    authAdmin: {} as never,
    exportDb: {} as never,
    ranking: { lookup: vi.fn() },
    actionsBoss: null,
    appBaseUrl: 'https://deucex.vercel.app',
    now: () => NOW,
    confirmations: new ConfirmationTokens(),
  } as unknown as AdminMcpDeps;

  const app = Fastify();
  void app.register(async (instance) => {
    await registerAdminMcpRoutes(instance, deps);
  });

  async function tokenFor(who: 'staff-support' | 'staff-owner'): Promise<string> {
    const s = staff[who]!;
    const created = await createMcpToken(
      consoleDb,
      { ...s, actingRole: s.role },
      { device: null, ip: null },
      'Claude Code',
      NOW,
    );
    return created.token;
  }

  let rpcId = 0;
  async function rpc(token: string | null, method: string, params: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      payload: { jsonrpc: '2.0', id: ++rpcId, method, params },
    });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  }

  async function call(token: string, name: string, args: Record<string, unknown> = {}) {
    const res = await rpc(token, 'tools/call', { name, arguments: args });
    expect(res.status).toBe(200);
    const result = res.body.result as { isError: boolean; content: Array<{ text: string }> };
    const text = result.content[0]!.text;
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { isError: result.isError, text, json };
  }

  /** Rows written by MCP calls, not by creating the tokens. */
  const mcpRows = () => audit.filter((a) => !a.action_type.startsWith('mcp_token_'));

  return {
    app,
    audit,
    tokens,
    player,
    playerUpdates,
    notifications,
    sendEmail,
    revokedStaff,
    consoleDb,
    tokenFor,
    rpc,
    call,
    mcpRows,
  };
}

describe('admin MCP tokens', () => {
  it('stores only a hash, shows the token once, and audits creation', async () => {
    const t = setup();
    const token = await t.tokenFor('staff-owner');
    expect(token.startsWith('dxm_')).toBe(true);
    expect(t.tokens[0]!.token_hash).toBe(hashMcpToken(token));
    expect(JSON.stringify(t.tokens)).not.toContain(token);
    expect(t.audit[0]!.action_type).toBe('mcp_token_create');
    expect(t.audit[0]!.via).toBe('console');
  });

  it('refuses a missing, unknown, revoked or de-staffed token', async () => {
    const t = setup();
    expect((await t.rpc(null, 'tools/list')).status).toBe(401);
    expect((await t.rpc('dxm_not-a-real-token', 'tools/list')).status).toBe(401);

    const token = await t.tokenFor('staff-owner');
    expect((await t.rpc(token, 'tools/list')).status).toBe(200);
    await revokeMcpToken(
      t.consoleDb,
      { id: 'staff-owner', name: 'Olive Owner', email: '', role: 'owner', actingRole: 'owner' },
      { device: null, ip: null },
      t.tokens[0]!.id,
    );
    expect((await t.rpc(token, 'tools/list')).status).toBe(401);

    const support = await t.tokenFor('staff-support');
    t.revokedStaff.add('staff-support');
    expect((await t.rpc(support, 'tools/list')).status).toBe(401);
  });
});

describe('roles (AD-2)', () => {
  it('lists only the tools a role holds', () => {
    const support = listToolsFor('support').map((t) => t.name);
    const owner = listToolsFor('owner').map((t) => t.name);
    expect(support).toContain('find_players');
    expect(support).toContain('extend_trial');
    for (const ownerTool of [
      'delete_account',
      'comp_elite',
      'offer_elite',
      'set_provider_switch',
      'get_spend',
    ]) {
      expect(support).not.toContain(ownerTool);
      expect(owner).toContain(ownerTool);
    }
    // Ops areas are absent for support too.
    expect(support).not.toContain('get_agent_health');
    expect(support).not.toContain('set_entry_deadline');
  });

  it('serves the role-scoped list over the transport, with the two-step token on actions', async () => {
    const t = setup();
    const res = await t.rpc(await t.tokenFor('staff-support'), 'tools/list');
    const tools = res.body.result.tools as Array<{
      name: string;
      inputSchema: { properties: Record<string, unknown> };
    }>;
    expect(tools.map((x) => x.name)).not.toContain('delete_account');
    const extend = tools.find((x) => x.name === 'extend_trial')!;
    expect(Object.keys(extend.inputSchema.properties)).toContain('confirmationToken');
  });

  it('refuses an owner tool to a support identity, and logs the attempt', async () => {
    const t = setup();
    const token = await t.tokenFor('staff-support');
    const res = await t.call(token, 'delete_account', {
      playerId: PLAYER_ID,
      reason: 'Player asked by email',
    });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/support role can't use delete_account; it needs owner/);
    expect(t.playerUpdates).toHaveLength(0);
    expect(t.sendEmail).not.toHaveBeenCalled();
    const rows = t.mcpRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action_type: 'mcp_refused',
      via: 'mcp',
      admin_name: 'Sam Park',
      role_at_time: 'support',
      player_id: null,
    });
  });
});

describe('reasons (AD-5)', () => {
  it('refuses a delete without a reason, writing and sending nothing but the audit row', async () => {
    const t = setup();
    const token = await t.tokenFor('staff-owner');
    for (const reason of [undefined, '   ']) {
      const res = await t.call(token, 'delete_account', {
        playerId: PLAYER_ID,
        ...(reason !== undefined ? { reason } : {}),
      });
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(/Write a reason/);
    }
    expect(t.player.deletion_effective_at).toBeNull();
    expect(t.playerUpdates).toHaveLength(0);
    expect(t.sendEmail).not.toHaveBeenCalled();
    expect(t.mcpRows().map((r) => r.action_type)).toEqual(['mcp_refused', 'mcp_refused']);
  });

  it('refuses the provider kill switch without a reason', async () => {
    const t = setup();
    const res = await t.call(await t.tokenFor('staff-owner'), 'set_provider_switch', {
      provider: 'transcription',
      state: 'off',
    });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/Write a reason/);
  });
});

describe('two-step (AD-3)', () => {
  it('previews, then runs only with the confirmation, through the admin-action gate', async () => {
    const t = setup();
    const token = await t.tokenFor('staff-owner');
    const args = { playerId: PLAYER_ID, reason: 'Player asked by email on 27 Sep' };

    const preview = await t.call(token, 'delete_account', args);
    expect(preview.isError).toBe(false);
    expect(preview.json!.status).toBe('needs_confirmation');
    expect(preview.json!.consequence).toMatch(/14-day cooling-off/);
    expect(t.player.deletion_effective_at).toBeNull();
    expect(t.sendEmail).not.toHaveBeenCalled();

    const confirmationToken = preview.json!.confirmationToken as string;

    // A different reason than the one previewed doesn't match.
    const swapped = await t.call(token, 'delete_account', {
      ...args,
      reason: 'Something else',
      confirmationToken,
    });
    expect(swapped.isError).toBe(true);
    expect(swapped.text).toMatch(/does not match/);
    expect(t.player.deletion_effective_at).toBeNull();

    const done = await t.call(token, 'delete_account', { ...args, confirmationToken });
    expect(done.isError).toBe(false);
    expect(done.json!.status).toBe('done');
    expect(t.player.deletion_effective_at).toBe('2026-10-12T09:00:00.000Z');
    expect(t.sendEmail).toHaveBeenCalledTimes(1);

    // Once only.
    const replay = await t.call(token, 'delete_account', { ...args, confirmationToken });
    expect(replay.isError).toBe(true);
    expect(t.sendEmail).toHaveBeenCalledTimes(1);

    const deleteRow = t.audit.find((a) => a.action_type === 'delete_account')!;
    expect(deleteRow).toMatchObject({
      via: 'mcp',
      player_id: PLAYER_ID,
      reason: 'Player asked by email on 27 Sep',
      role_at_time: 'owner',
    });
    expect(deleteRow.consequence).toBe(preview.json!.consequence);
  });

  it("refuses a confirmation after the player's state changed the sentence", async () => {
    const t = setup();
    const token = await t.tokenFor('staff-support');
    const preview = await t.call(token, 'extend_trial', { playerId: PLAYER_ID });
    t.player.trial_ends_at = '2026-11-01T00:00:00.000Z'; // someone else extended it meanwhile
    const res = await t.call(token, 'extend_trial', {
      playerId: PLAYER_ID,
      confirmationToken: preview.json!.confirmationToken,
    });
    expect(res.isError).toBe(true);
    expect(t.playerUpdates).toHaveLength(0);
  });

  it("won't let one staff member use another's confirmation", async () => {
    const t = setup();
    const preview = await t.call(await t.tokenFor('staff-owner'), 'extend_trial', {
      playerId: PLAYER_ID,
    });
    const res = await t.call(await t.tokenFor('staff-support'), 'extend_trial', {
      playerId: PLAYER_ID,
      confirmationToken: preview.json!.confirmationToken,
    });
    expect(res.isError).toBe(true);
    expect(t.playerUpdates).toHaveLength(0);
  });
});

describe('audit (AD-4)', () => {
  it('writes one mcp row for every call: reads, previews, refusals and confirmed actions', async () => {
    const t = setup();
    const token = await t.tokenFor('staff-support');

    await t.call(token, 'whoami');
    await t.call(token, 'no_such_tool');
    await t.call(token, 'extend_trial', { playerId: 'not-a-uuid' });
    const preview = await t.call(token, 'extend_trial', { playerId: PLAYER_ID });
    await t.call(token, 'extend_trial', {
      playerId: PLAYER_ID,
      confirmationToken: preview.json!.confirmationToken,
    });

    const rows = t.mcpRows();
    expect(rows.map((r) => r.action_type)).toEqual([
      'mcp_read',
      'mcp_refused',
      'mcp_refused',
      'mcp_preview',
      'trial_extend',
    ]);
    expect(rows.every((r) => r.via === 'mcp' && r.admin_id === 'staff-support')).toBe(true);
    // Staff lookups never land in the player's own log; the confirmed change does.
    expect(rows.slice(0, 4).every((r) => r.player_id === null)).toBe(true);
    expect(rows[4]!.player_id).toBe(PLAYER_ID);
    expect(t.notifications).toEqual(['Your Pro trial was extended']);
    // The confirmation token itself is never stored.
    expect(JSON.stringify(rows)).not.toContain(preview.json!.confirmationToken as string);
  });

  it('shows an MCP call in the admin audit log as mcp:<admin>', async () => {
    const q: ConsoleQuery = {
      async query(text: string) {
        if (text.includes('from public.admin_users')) return { rows: [], rowCount: 0 } as never;
        return {
          rows: [
            {
              id: 'a1',
              created_at: NOW.toISOString(),
              admin_name: 'Olive Owner',
              role_at_time: 'owner',
              action_type: 'mcp_read',
              player_name: null,
              consequence: 'Read only',
              reason: null,
              via: 'mcp',
            },
            {
              id: 'a2',
              created_at: NOW.toISOString(),
              admin_name: 'Olive Owner',
              role_at_time: 'owner',
              action_type: 'trial_extend',
              player_name: 'Arya Dubey',
              consequence: 'Moves',
              reason: null,
              via: 'console',
            },
          ],
          rowCount: 2,
        } as never;
      },
    };
    const log = await listAdminAudit(q, 'staff-owner', 'owner');
    expect(log.entries.map((e) => e.actor)).toEqual(['mcp:Olive Owner', 'Olive Owner']);
  });
});
