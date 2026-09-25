import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { EmailClient } from '@deucex/actions/account';
import Fastify from 'fastify';
import { FakeDb } from '../test-support/fake-db';
import { registerAccountRoutes, type AccountRoutesDeps } from './routes';

function fakeAnonClient(validToken: string, playerId: string): SupabaseClient<Database> {
  return {
    auth: {
      async getUser(token?: string) {
        if (token === validToken) return { data: { user: { id: playerId } }, error: null };
        return { data: { user: null }, error: new Error('invalid token') };
      },
    },
  } as unknown as SupabaseClient<Database>;
}

function fakeEmailClient(): EmailClient & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    async sendEmail(input) {
      sent.push(input);
    },
  };
}

async function buildApp(fake: FakeDb, overrides: Partial<AccountRoutesDeps> = {}) {
  const app = Fastify();
  const deps: AccountRoutesDeps = {
    db: fake as unknown as SupabaseClient<Database>,
    anonClient: fakeAnonClient('good-token', 'player-1'),
    email: fakeEmailClient(),
    appBaseUrl: 'https://app.deucex.ai',
    ...overrides,
  };
  await registerAccountRoutes(app, deps);
  await app.ready();
  return app;
}

function seedDeletionApproval(fake: FakeDb) {
  fake.tables.approvals = [
    {
      id: 'approval-1',
      player_id: 'player-1',
      action_type: 'account_deletion_request',
      payload: {},
    },
  ];
  fake.tables.players = [{ id: 'player-1', email: 'arya@example.com' }];
}

function seedExportApproval(fake: FakeDb) {
  fake.tables.approvals = [
    { id: 'approval-1', player_id: 'player-1', action_type: 'data_export_request', payload: {} },
  ];
  fake.tables.players = [{ id: 'player-1', email: 'arya@example.com' }];
  fake.tables.notes = [];
  fake.tables.check_ins = [];
  fake.tables.ledger_lines = [];
  fake.tables.reserve_entries = [];
  fake.tables.budget_estimates = [];
}

describe('POST /account/delete/request', () => {
  it('emails the confirm link for an authenticated player', async () => {
    const fake = new FakeDb();
    seedDeletionApproval(fake);
    const email = fakeEmailClient();
    const app = await buildApp(fake, { email });

    const res = await app.inject({
      method: 'POST',
      url: '/account/delete/request',
      headers: { authorization: 'Bearer good-token' },
      payload: { approvalId: 'approval-1' },
    });

    expect(res.statusCode).toBe(202);
    expect(email.sent).toHaveLength(1);
  });

  it('refuses an unauthenticated request', async () => {
    const fake = new FakeDb();
    seedDeletionApproval(fake);
    const app = await buildApp(fake);

    const res = await app.inject({
      method: 'POST',
      url: '/account/delete/request',
      payload: { approvalId: 'approval-1' },
    });

    expect(res.statusCode).toBe(401);
  });

  // Replay protection (a second call for the same approval returning 409)
  // is proven at the packages/actions unit level (account.test.ts), the
  // same split financial/routes.test.ts already uses: FakeDb is a plain
  // in-memory store with no unique-constraint enforcement on
  // approval_consumptions.approval_id, so it cannot exercise the real
  // claim race the way gate.ts's SupabaseApprovalGateDb does against
  // Postgres.
});

describe('POST /account/delete/confirm', () => {
  it('sets deletion_effective_at fourteen days out for a valid token, unauthenticated', async () => {
    const fake = new FakeDb();
    fake.tables.players = [{ id: 'player-1', deletion_confirmation_token: 'tok-1' }];
    const app = await buildApp(fake);

    const res = await app.inject({
      method: 'POST',
      url: '/account/delete/confirm',
      payload: { token: 'tok-1' },
    });

    expect(res.statusCode).toBe(200);
    expect(fake.tables.players[0]?.deletion_effective_at).toBeTruthy();
    expect(fake.tables.players[0]?.deletion_confirmation_token).toBeNull();
  });

  it('returns 404 for an unknown token', async () => {
    const fake = new FakeDb();
    fake.tables.players = [{ id: 'player-1', deletion_confirmation_token: 'tok-1' }];
    const app = await buildApp(fake);

    const res = await app.inject({
      method: 'POST',
      url: '/account/delete/confirm',
      payload: { token: 'wrong-token' },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /account/delete/cancel', () => {
  it('clears deletion_effective_at for the authenticated player', async () => {
    const fake = new FakeDb();
    fake.tables.players = [
      {
        id: 'player-1',
        deletion_effective_at: '2026-10-07T00:00:00Z',
        deletion_cancelled_at: null,
      },
    ];
    const app = await buildApp(fake);

    const res = await app.inject({
      method: 'POST',
      url: '/account/delete/cancel',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(res.statusCode).toBe(204);
    expect(fake.tables.players[0]?.deletion_effective_at).toBeNull();
    expect(fake.tables.players[0]?.deletion_cancelled_at).toBeTruthy();
  });
});

describe('POST /account/export/request', () => {
  it('emails a JSON/CSV/transcripts bundle for an authenticated player', async () => {
    const fake = new FakeDb();
    seedExportApproval(fake);
    const email = fakeEmailClient();
    const app = await buildApp(fake, { email });

    const res = await app.inject({
      method: 'POST',
      url: '/account/export/request',
      headers: { authorization: 'Bearer good-token' },
      payload: { approvalId: 'approval-1' },
    });

    expect(res.statusCode).toBe(202);
    expect(email.sent).toHaveLength(1);
  });
});
