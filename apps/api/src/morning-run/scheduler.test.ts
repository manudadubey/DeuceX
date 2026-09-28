import { describe, expect, it } from 'vitest';
import { localDayStart, planMorningRun } from './scheduler';

// Step 5.2: one morning batch from 07:00 local per player, with catch-up.
describe('planMorningRun', () => {
  // 2026-09-21T21:00:00Z is 07:00 in Sydney (+10), 23:00 in Rome (+2) and
  // 06:00 in Tokyo (+9).
  const now = new Date('2026-09-21T21:00:00Z');
  const players = [
    { id: 'sydney', timezone: 'Australia/Sydney' },
    { id: 'rome', timezone: 'Europe/Rome' },
    { id: 'tokyo', timezone: 'Asia/Tokyo' },
  ];

  it('runs every daily agent for a player whose local time is 07:00, and no one outside the window', () => {
    const jobs = planMorningRun(players, new Set(['sydney', 'rome']), now);
    expect(jobs).toEqual([
      { agentName: 'financial', playerId: 'sydney', scheduledWindow: '2026-09-22' },
      { agentName: 'mindset-coach', playerId: 'sydney', scheduledWindow: '2026-09-22' },
    ]);
  });

  it('holds the Mindset Coach back until a player has three notes', () => {
    const jobs = planMorningRun(players, new Set(), now);
    expect(jobs.map((j) => j.agentName)).toEqual(['financial']);
  });

  it("keys the window on the player's own date, so a repeat tick is idempotent", () => {
    const again = planMorningRun(players, new Set(['sydney']), new Date('2026-09-21T21:40:00Z'));
    expect(new Set(again.map((j) => j.scheduledWindow))).toEqual(new Set(['2026-09-22']));
  });

  it('catches up a missed 07:00 later the same day (the API was down at 07:00)', () => {
    // 15:00 in Rome.
    const afternoon = new Date('2026-09-22T13:00:00Z');
    const jobs = planMorningRun(players, new Set(['rome']), afternoon);
    expect(jobs.filter((j) => j.playerId === 'rome')).toEqual([
      { agentName: 'financial', playerId: 'rome', scheduledWindow: '2026-09-22' },
      { agentName: 'mindset-coach', playerId: 'rome', scheduledWindow: '2026-09-22' },
    ]);
  });

  it('does not re-run an agent that already ran today', () => {
    const afternoon = new Date('2026-09-22T13:00:00Z');
    const jobs = planMorningRun(
      players,
      new Set(['rome']),
      afternoon,
      new Set(['mindset-coach:rome']),
    );
    expect(jobs.filter((j) => j.playerId === 'rome').map((j) => j.agentName)).toEqual([
      'financial',
    ]);
  });

  it('does not make up a missed morning after 21:00 local', () => {
    // 21:30 in Rome.
    const late = new Date('2026-09-22T19:30:00Z');
    expect(
      planMorningRun(players, new Set(['rome']), late).some((j) => j.playerId === 'rome'),
    ).toBe(false);
  });
});

describe('localDayStart', () => {
  it("is the player's own local midnight", () => {
    // 15:00:00 Rome (+2) on 22 September began at 22:00 UTC on the 21st.
    expect(localDayStart(new Date('2026-09-22T13:00:00Z'), 'Europe/Rome').toISOString()).toBe(
      '2026-09-21T22:00:00.000Z',
    );
  });
});
