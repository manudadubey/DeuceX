import { describe, expect, it } from 'vitest';
import { planMorningRun } from './scheduler';

// Step 5.2: one morning batch at 07:00 local per player.
describe('planMorningRun', () => {
  // 2026-09-21T21:00:00Z is 07:00 in Sydney (+10), 23:00 in Rome (+2) and
  // 06:00 in Tokyo (+9).
  const now = new Date('2026-09-21T21:00:00Z');
  const players = [
    { id: 'sydney', timezone: 'Australia/Sydney' },
    { id: 'rome', timezone: 'Europe/Rome' },
    { id: 'tokyo', timezone: 'Asia/Tokyo' },
  ];

  it('runs every daily agent for a player whose local time is 07:00, and no one else', () => {
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
});
