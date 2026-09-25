import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { AgentRunsDb } from '@deucex/actions';
import { createMockReceiptExtractionClient } from '@deucex/agents';
import Fastify from 'fastify';
import { FakeDb } from '../test-support/fake-db';
import { registerFinancialRoutes, type FinancialRoutesDeps } from './routes';

function fakeAgentRunsDb(): AgentRunsDb {
  return { insertAgentRun: async () => undefined };
}

function fakeAnonClient(validToken: string, playerId: string): SupabaseClient<Database> {
  return {
    auth: {
      async getUser(token?: string) {
        if (token === validToken) {
          return { data: { user: { id: playerId } }, error: null };
        }
        return { data: { user: null }, error: new Error('invalid token') };
      },
    },
  } as unknown as SupabaseClient<Database>;
}

// Same shape as notes/routes.test.ts's own buildMultipart.
function buildMultipart(file: {
  field: string;
  filename: string;
  contentType: string;
  data: Buffer;
}): { body: Buffer; contentType: string } {
  const boundary = '----deucextestboundary';
  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    ),
    file.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function buildApp(fake: FakeDb, overrides: Partial<FinancialRoutesDeps> = {}) {
  const app = Fastify();
  const deps: FinancialRoutesDeps = {
    db: fake as unknown as SupabaseClient<Database>,
    anonClient: fakeAnonClient('good-token', 'player-1'),
    extractionClient: createMockReceiptExtractionClient(),
    agentRuns: fakeAgentRunsDb(),
    enqueueRecompute: async () => undefined,
    ...overrides,
  };
  await registerFinancialRoutes(app, deps);
  await app.ready();
  return app;
}

describe('POST /financial/receipts', () => {
  it('returns the extracted proposal for an authenticated upload', async () => {
    const app = await buildApp(new FakeDb());
    const { body, contentType } = buildMultipart({
      field: 'image',
      filename: 'receipt.jpg',
      contentType: 'image/jpeg',
      data: Buffer.from('fake-jpeg-bytes'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/financial/receipts',
      headers: { authorization: 'Bearer good-token', 'content-type': contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.proposal.merchant).toBe('Trattoria da Gino · Genova');
  });

  it('refuses an unauthenticated request', async () => {
    const app = await buildApp(new FakeDb());
    const { body, contentType } = buildMultipart({
      field: 'image',
      filename: 'receipt.jpg',
      contentType: 'image/jpeg',
      data: Buffer.from('fake-jpeg-bytes'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/financial/receipts',
      headers: { 'content-type': contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when no image is attached', async () => {
    const app = await buildApp(new FakeDb());
    const boundary = '----deucextestboundary';
    const emptyMultipart = Buffer.from(`--${boundary}--\r\n`);

    const res = await app.inject({
      method: 'POST',
      url: '/financial/receipts',
      headers: {
        authorization: 'Bearer good-token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: emptyMultipart,
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /financial/receivables/:id/receive', () => {
  function seedForReceive(fake: FakeDb) {
    fake.tables.approvals = [
      {
        id: 'approval-1',
        player_id: 'player-1',
        action_type: 'receivable_received',
        payload: { receivableId: 'pz-1', receivedDate: '2026-10-03', realisedHomeCurrency: 'AUD' },
      },
    ];
    fake.tables.prize_receivables = [
      {
        id: 'pz-1',
        player_id: 'player-1',
        status: 'pending',
        gross_amount: 890,
        player_share: 1,
        withholding_amount: 0,
        currency: 'EUR',
      },
    ];
    fake.tables.fx_rates_daily = [
      { date: '2026-10-03', currency: 'EUR', rate_to_eur: 1, source: 'ecb' },
      { date: '2026-10-03', currency: 'AUD', rate_to_eur: 1.6, source: 'ecb' },
    ];
    fake.tables.reserve_entries = [];
  }

  it('realises the receivable and updates reserves given a valid approval', async () => {
    const fake = new FakeDb();
    seedForReceive(fake);
    const app = await buildApp(fake);

    const res = await app.inject({
      method: 'POST',
      url: '/financial/receivables/pz-1/receive',
      headers: { authorization: 'Bearer good-token', 'content-type': 'application/json' },
      payload: {
        approvalId: 'approval-1',
        receivedDate: '2026-10-03',
        realisedHomeCurrency: 'AUD',
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.realisedAmountHome).toBeCloseTo(890 * 1.6, 5);
    expect(fake.tables.prize_receivables?.[0]?.status).toBe('received');
  });

  it('refuses a payload that does not match the approval', async () => {
    const fake = new FakeDb();
    seedForReceive(fake);
    const app = await buildApp(fake);

    const res = await app.inject({
      method: 'POST',
      url: '/financial/receivables/pz-1/receive',
      headers: { authorization: 'Bearer good-token', 'content-type': 'application/json' },
      payload: {
        approvalId: 'approval-1',
        receivedDate: '2026-10-04', // does not match the approval's own payload
        realisedHomeCurrency: 'AUD',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when a required field is missing', async () => {
    const app = await buildApp(new FakeDb());

    const res = await app.inject({
      method: 'POST',
      url: '/financial/receivables/pz-1/receive',
      headers: { authorization: 'Bearer good-token', 'content-type': 'application/json' },
      payload: { approvalId: 'approval-1' },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /financial/recompute', () => {
  it('enqueues a recompute for the authenticated player', async () => {
    let enqueuedFor: string | undefined;
    const app = await buildApp(new FakeDb(), {
      enqueueRecompute: async (playerId) => {
        enqueuedFor = playerId;
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/financial/recompute',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(res.statusCode).toBe(202);
    expect(enqueuedFor).toBe('player-1');
  });
});
