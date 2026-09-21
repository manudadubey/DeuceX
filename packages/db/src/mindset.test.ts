import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  getMindsetBoundaries,
  pauseOneWeekFrom,
  setInsightFeedback,
  setInsightFocusDone,
  setPatternDismissed,
  updateMindsetBoundaries,
} from './mindset';
import type { Database } from './database.types';

// Same shape as notes.test.ts's own fakeQuery: proves the filters and
// payload shapes this module builds, not the database itself.
function fakeQuery(result: { data: unknown; error: Error | null }) {
  const query: Record<string, unknown> = {};
  const chain = ['select', 'eq', 'update', 'upsert'];
  for (const method of chain) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.single = vi.fn().mockResolvedValue(result);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  (query as unknown as { then: PromiseLike<unknown>['then'] }).then = (resolve) =>
    Promise.resolve(result).then(resolve as never);
  return query;
}

describe('setPatternDismissed', () => {
  it('sets dismissed_at when dismissing, clears it on undo', async () => {
    const query = fakeQuery({ data: { id: 'pattern-1', dismissed: true }, error: null });
    const from = vi.fn().mockReturnValue(query);
    const client = { from } as unknown as SupabaseClient<Database>;

    await setPatternDismissed(client, 'pattern-1', true);

    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ dismissed: true, dismissed_at: expect.any(String) }),
    );
    expect(query.eq).toHaveBeenCalledWith('id', 'pattern-1');
  });

  it('undo clears dismissed_at', async () => {
    const query = fakeQuery({ data: { id: 'pattern-1', dismissed: false }, error: null });
    const from = vi.fn().mockReturnValue(query);
    const client = { from } as unknown as SupabaseClient<Database>;

    await setPatternDismissed(client, 'pattern-1', false);

    expect(query.update).toHaveBeenCalledWith({ dismissed: false, dismissed_at: null });
  });
});

describe('setInsightFocusDone / setInsightFeedback', () => {
  it('MC-12: marks the focus done with a timestamp', async () => {
    const query = fakeQuery({ data: { id: 'insight-1', focus_done: true }, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await setInsightFocusDone(client, 'insight-1', true);

    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ focus_done: true, focus_done_at: expect.any(String) }),
    );
  });

  it('MC-13: records the feedback pair with a timestamp', async () => {
    const query = fakeQuery({ data: { id: 'insight-1', feedback: 'not_today' }, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await setInsightFeedback(client, 'insight-1', 'not_today');

    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ feedback: 'not_today', feedback_at: expect.any(String) }),
    );
  });
});

describe('getMindsetBoundaries', () => {
  it('returns the documented defaults when no row exists for the player', async () => {
    const query = fakeQuery({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    const boundaries = await getMindsetBoundaries(client, 'player-1');

    expect(boundaries).toMatchObject({
      player_id: 'player-1',
      quiet_match_mornings: true,
      coach_sees_patterns: true,
      paused_until: null,
    });
  });
});

describe('updateMindsetBoundaries', () => {
  it('upserts on player_id', async () => {
    const query = fakeQuery({
      data: { player_id: 'player-1', paused_until: '2026-09-28' },
      error: null,
    });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await updateMindsetBoundaries(client, 'player-1', { pausedUntil: '2026-09-28' });

    expect(query.upsert).toHaveBeenCalledWith(
      { player_id: 'player-1', paused_until: '2026-09-28' },
      { onConflict: 'player_id' },
    );
  });
});

describe('pauseOneWeekFrom', () => {
  it('adds exactly seven days (MC-15)', () => {
    expect(pauseOneWeekFrom('2026-09-21')).toBe('2026-09-28');
  });
});
