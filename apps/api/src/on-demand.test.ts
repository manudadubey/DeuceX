import { describe, expect, it } from 'vitest';
import type { OnDemandKind } from '@deucex/shared';
import { createOnDemandLimiter, type OnDemandDb } from './on-demand';

function memoryDb(tier: string | null, timezone = 'Europe/Rome') {
  const rows: Array<{ playerId: string; kind: OnDemandKind; at: Date }> = [];
  const db: OnDemandDb = {
    async getPlayer() {
      return { tier, timezone };
    },
    async windowSince(playerId, kind, since) {
      const inWindow = rows
        .filter((r) => r.playerId === playerId && r.kind === kind && r.at >= since)
        .sort((a, b) => a.at.getTime() - b.at.getTime());
      return { count: inWindow.length, oldest: inWindow[0]?.at.toISOString() ?? null };
    },
    async record(playerId, kind, at) {
      rows.push({ playerId, kind, at });
    },
  };
  return { db, rows };
}

describe('on-demand limiter (step 5.4)', () => {
  it('allows a Pro player 10 menu scans in 24 hours and refuses the 11th', async () => {
    const { db, rows } = memoryDb('pro');
    let now = new Date('2026-09-26T08:00:00Z');
    const limiter = createOnDemandLimiter(db, () => now);

    for (let i = 0; i < 10; i++) {
      now = new Date(now.getTime() + 60_000);
      expect((await limiter.claim('p1', 'menu_scan')).allowed).toBe(true);
    }
    const refused = await limiter.claim('p1', 'menu_scan');
    expect(refused.allowed).toBe(false);
    if (refused.allowed) return;
    expect(refused.limit).toBe(10);
    // The first scan was at 08:01 UTC, so the next frees up 24 hours later.
    expect(refused.availableAt).toBe('2026-09-27T08:01:00.000Z');
    expect(refused.message).toBe(
      "You've used all 10 menu scans for the last 24 hours. The next one is available at 10:01 on 27 Sept (Europe/Rome time).",
    );
    expect(rows).toHaveLength(10); // a refused request isn't recorded
  });

  it('frees up once the oldest request leaves the window', async () => {
    const { db } = memoryDb('pro');
    let now = new Date('2026-09-26T08:00:00Z');
    const limiter = createOnDemandLimiter(db, () => now);
    for (let i = 0; i < 5; i++) await limiter.claim('p1', 'extraction_retry');
    expect((await limiter.claim('p1', 'extraction_retry')).allowed).toBe(false);

    now = new Date('2026-09-27T08:00:01Z');
    expect((await limiter.claim('p1', 'extraction_retry')).allowed).toBe(true);
  });

  it('counts each kind and each player separately', async () => {
    const { db } = memoryDb('pro');
    const limiter = createOnDemandLimiter(db, () => new Date('2026-09-26T08:00:00Z'));
    for (let i = 0; i < 5; i++) await limiter.claim('p1', 'extraction_retry');
    expect((await limiter.claim('p1', 'receipt_scan')).allowed).toBe(true);
    expect((await limiter.claim('p2', 'extraction_retry')).allowed).toBe(true);
  });
});
