import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShareLink, listShareLinks, renewShareLink, revokeShareLink } from './sharing';
import type { Database } from './database.types';

function fakeQuery(result: { data: unknown; error: Error | null }) {
  const query: Record<string, unknown> = {};
  const chain = ['select', 'eq', 'insert', 'update', 'order'];
  for (const method of chain) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.single = vi.fn().mockResolvedValue(result);
  (query as unknown as { then: PromiseLike<unknown>['then'] }).then = (resolve) =>
    Promise.resolve(result).then(resolve as never);
  return query;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createShareLink', () => {
  it('inserts a 32-hex-char token and an expiry 90 days out', async () => {
    const query = fakeQuery({ data: { id: 'link-1' }, error: null });
    const from = vi.fn().mockReturnValue(query);
    const client = { from } as unknown as SupabaseClient<Database>;

    await createShareLink(client, { playerId: 'player-1', scope: 'coach' });

    expect(from).toHaveBeenCalledWith('share_links');
    const payload = (query.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(payload.player_id).toBe('player-1');
    expect(payload.scope).toBe('coach');
    expect(payload.token).toMatch(/^[0-9a-f]{32}$/);
    expect(payload.expires_at).toBe('2026-12-22T00:00:00.000Z');
  });

  it('generates a different token on each call (no collision by construction)', async () => {
    const query = fakeQuery({ data: { id: 'link-1' }, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await createShareLink(client, { playerId: 'player-1', scope: 'coach' });
    const first = (query.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    await createShareLink(client, { playerId: 'player-1', scope: 'manager' });
    const second = (query.insert as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as Record<
      string,
      unknown
    >;

    expect(first.token).not.toBe(second.token);
  });
});

describe('listShareLinks', () => {
  it('scopes to the player, newest first', async () => {
    const query = fakeQuery({ data: [], error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await listShareLinks(client, 'player-1');

    expect(query.eq).toHaveBeenCalledWith('player_id', 'player-1');
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});

describe('revokeShareLink', () => {
  it('sets revoked: true by id', async () => {
    const query = fakeQuery({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await revokeShareLink(client, 'link-1');

    expect(query.update).toHaveBeenCalledWith({ revoked: true });
    expect(query.eq).toHaveBeenCalledWith('id', 'link-1');
  });
});

describe('renewShareLink', () => {
  it('resets expires_at 90 days from now and stamps renewed_at', async () => {
    const query = fakeQuery({ data: { id: 'link-1' }, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await renewShareLink(client, 'link-1');

    expect(query.update).toHaveBeenCalledWith({
      renewed_at: '2026-09-23T00:00:00.000Z',
      expires_at: '2026-12-22T00:00:00.000Z',
    });
  });
});
