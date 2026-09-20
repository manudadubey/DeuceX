import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  FREE_TIER_MONTHLY_NOTE_LIMIT,
  getSavedNotesThisMonth,
  listNotes,
  saveCheckIn,
  updateNoteContent,
} from './notes';
import type { Database } from './database.types';

// A minimal fake of the query-builder chains these functions call, not a
// real PostgREST client — proving the filters and payload shapes built here,
// not the database itself (that's what the migration and RLS policies do,
// exercised for real in rls.integration.test.ts).
function fakeQuery(result: { data: unknown; error: Error | null }) {
  const query: Record<string, unknown> = {};
  const chain = ['select', 'neq', 'gte', 'order', 'eq', 'or'];
  for (const method of chain) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  // The query itself is awaitable, like a real PostgREST builder.
  (query as unknown as { then: PromiseLike<unknown>['then'] }).then = (resolve) =>
    Promise.resolve(result).then(resolve as never);
  return query;
}

describe('listNotes', () => {
  it('excludes deleted notes and orders by recorded_at descending', async () => {
    const query = fakeQuery({ data: [{ id: 'note-1' }], error: null });
    const from = vi.fn().mockReturnValue(query);
    const client = { from } as unknown as SupabaseClient<Database>;

    const result = await listNotes(client);

    expect(from).toHaveBeenCalledWith('notes');
    expect(query.neq).toHaveBeenCalledWith('status', 'deleted');
    expect(query.order).toHaveBeenCalledWith('recorded_at', { ascending: false });
    expect(result).toEqual([{ id: 'note-1' }]);
  });

  it('filters by context when given', async () => {
    const query = fakeQuery({ data: [], error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await listNotes(client, { ctx: 'match' });

    expect(query.eq).toHaveBeenCalledWith('ctx', 'match');
  });

  it('searches transcript, result, opponent and matching tags (S-17)', async () => {
    const query = fakeQuery({ data: [], error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await listNotes(client, { search: 'tiebreak' });

    const orArg = (query.or as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(orArg).toContain('transcript.ilike.%tiebreak%');
    expect(orArg).toContain('result.ilike.%tiebreak%');
    expect(orArg).toContain('opponent.ilike.%tiebreak%');
    expect(orArg).toContain('tags.cs.["Tiebreak"]');
  });

  it('escapes ilike wildcard characters in the search term', async () => {
    const query = fakeQuery({ data: [], error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await listNotes(client, { search: '50%_off' });

    const orArg = (query.or as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(orArg).toContain('transcript.ilike.%50\\%\\_off%');
  });

  it('throws when the query fails', async () => {
    const query = fakeQuery({ data: null, error: new Error('boom') });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await expect(listNotes(client)).rejects.toThrow('boom');
  });
});

describe('updateNoteContent', () => {
  function fakeUpdateClient(row: unknown, error: Error | null) {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: row, error }),
        }),
      }),
    });
    const from = vi.fn().mockReturnValue({ update });
    return { client: { from } as unknown as SupabaseClient<Database>, update };
  }

  it('only includes fields explicitly present in the patch', async () => {
    const { client, update } = fakeUpdateClient({ id: 'note-1' }, null);

    await updateNoteContent(client, 'note-1', { mood: 'confident', tags: ['Tiebreak'] });

    expect(update).toHaveBeenCalledWith({ mood: 'confident', tags: ['Tiebreak'] });
  });

  it('maps coachShare to the coach_share column', async () => {
    const { client, update } = fakeUpdateClient({ id: 'note-1' }, null);

    await updateNoteContent(client, 'note-1', { coachShare: false });

    expect(update).toHaveBeenCalledWith({ coach_share: false });
  });

  it('allows explicitly clearing a field to null', async () => {
    const { client, update } = fakeUpdateClient({ id: 'note-1' }, null);

    await updateNoteContent(client, 'note-1', { mood: null });

    expect(update).toHaveBeenCalledWith({ mood: null });
  });
});

describe('getSavedNotesThisMonth', () => {
  it('calls the auth.uid()-scoped RPC with no arguments', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 4, error: null });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    const count = await getSavedNotesThisMonth(client);

    expect(rpc).toHaveBeenCalledWith('notes_saved_this_month');
    expect(count).toBe(4);
  });

  it('defaults to zero when the RPC returns null', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    expect(await getSavedNotesThisMonth(client)).toBe(0);
  });

  it('is below the Free-tier limit constant used by the UI lock state', () => {
    expect(FREE_TIER_MONTHLY_NOTE_LIMIT).toBe(10);
  });
});

describe('saveCheckIn', () => {
  it('upserts on (player_id, date) so a second save the same day replaces the first', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'checkin-1' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    const client = {
      from: vi.fn().mockReturnValue({ upsert }),
    } as unknown as SupabaseClient<Database>;

    await saveCheckIn(client, {
      playerId: 'player-1',
      date: '2026-09-21',
      value: 4,
      source: 'scribe',
    });

    expect(upsert).toHaveBeenCalledWith(
      {
        player_id: 'player-1',
        date: '2026-09-21',
        value: 4,
        sentence: null,
        source: 'scribe',
      },
      { onConflict: 'player_id,date' },
    );
  });
});
