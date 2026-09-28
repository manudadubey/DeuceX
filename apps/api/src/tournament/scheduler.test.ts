import { describe, expect, it } from 'vitest';
import { lastScheduledInstant, playersNeedingRun, scheduledWindowFor } from './scheduler';

describe('weekly tournament run catch-up', () => {
  it('finds the most recent Sunday 20:00 UTC', () => {
    // Monday 28 September 2026, 02:00 UTC: the run was due the evening before.
    expect(lastScheduledInstant(new Date('2026-09-28T02:00:00Z')).toISOString()).toBe(
      '2026-09-27T20:00:00.000Z',
    );
    // Sunday before 20:00 still belongs to the previous week's run.
    expect(lastScheduledInstant(new Date('2026-09-27T19:59:00Z')).toISOString()).toBe(
      '2026-09-20T20:00:00.000Z',
    );
    expect(lastScheduledInstant(new Date('2026-09-27T20:00:00Z')).toISOString()).toBe(
      '2026-09-27T20:00:00.000Z',
    );
  });

  it('keys a late catch-up on the same week as the on-time run', () => {
    const since = lastScheduledInstant(new Date('2026-09-29T09:00:00Z'));
    expect(scheduledWindowFor(since)).toBe(scheduledWindowFor(new Date('2026-09-27T20:00:00Z')));
  });

  it('only runs players who have not had a run since then', () => {
    const players = [{ id: 'a' }, { id: 'b' }];
    expect(playersNeedingRun(players, new Set(['a']))).toEqual([{ id: 'b' }]);
  });
});
