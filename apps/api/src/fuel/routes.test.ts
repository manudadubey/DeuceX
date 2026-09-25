import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import {
  createMockMenuExtractionClient,
  createUnreadableMenuExtractionClient,
  type MenuExtractionModelClient,
} from '@deucex/agents';
import Fastify from 'fastify';
import { MemoryFuelStore } from './memory-store';
import { registerFuelRoutes, type FuelRoutesDeps } from './routes';

function fakeAnonClient(): SupabaseClient<Database> {
  return {
    auth: {
      async getUser(token?: string) {
        if (token === 'good-token') return { data: { user: { id: 'player-1' } }, error: null };
        return { data: { user: null }, error: new Error('invalid token') };
      },
    },
  } as unknown as SupabaseClient<Database>;
}

function multipart(pages: number): { body: Buffer; contentType: string } {
  const boundary = '----deucexfuelboundary';
  const parts: Buffer[] = [];
  for (let i = 0; i < pages; i++) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="page"; filename="menu-${i}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from(`fake-jpeg-${i}`),
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function buildApp(tier: string | null, client?: MenuExtractionModelClient) {
  const store = new MemoryFuelStore();
  store.players.set('player-1', {
    id: 'player-1',
    timezone: 'Europe/Bucharest',
    homeCurrency: 'AUD',
    dailyFoodAllowance: null,
    nextMatchAt: null,
    nextMatchLabel: null,
  });
  let modelCalls = 0;
  const base = client ?? createMockMenuExtractionClient();
  const deps: FuelRoutesDeps = {
    anonClient: fakeAnonClient(),
    store,
    extractionClient: {
      async complete(prompt) {
        modelCalls += 1;
        return base.complete(prompt);
      },
    },
    agentRuns: { insertAgentRun: async () => undefined },
    getTier: async () => tier,
  };
  const app = Fastify();
  await registerFuelRoutes(app, deps);
  await app.ready();
  return { app, store, modelCalls: () => modelCalls };
}

async function post(app: Awaited<ReturnType<typeof buildApp>>['app'], token: string, pages = 1) {
  const { body, contentType } = multipart(pages);
  return app.inject({
    method: 'POST',
    url: '/fuel/scans',
    headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
    payload: body,
  });
}

describe('POST /fuel/scans', () => {
  it('scans every page of a Pro player in one call', async () => {
    const { app, store, modelCalls } = await buildApp('pro');
    const res = await post(app, 'good-token', 2);
    expect(res.statusCode).toBe(200);
    expect(res.json().picks).toHaveLength(3);
    expect(modelCalls()).toBe(1);
    expect(store.scans[0]!.pages).toBe(2);
  });

  it('refuses a Free player before any photo reaches the model (FU-18, worksheet 15)', async () => {
    const { app, store, modelCalls } = await buildApp('free');
    const res = await post(app, 'good-token');
    expect(res.statusCode).toBe(403);
    expect(modelCalls()).toBe(0);
    expect(store.scans).toHaveLength(0);
  });

  it('refuses a missing session', async () => {
    const { app, modelCalls } = await buildApp('pro');
    const res = await post(app, 'bad-token');
    expect(res.statusCode).toBe(401);
    expect(modelCalls()).toBe(0);
  });

  it('answers 422 for an unreadable photo', async () => {
    const { app } = await buildApp('pro', createUnreadableMenuExtractionClient());
    const res = await post(app, 'good-token');
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'unreadable' });
  });
});
