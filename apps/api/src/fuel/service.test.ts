import { describe, expect, it } from 'vitest';
import type { AgentRunInsert, AgentRunsDb } from '@deucex/actions';
import {
  UnreadableMenuError,
  createMockMenuExtractionClient,
  createUnreadableMenuExtractionClient,
  type MenuExtractionModelClient,
} from '@deucex/agents';
import { MemoryFuelStore } from './memory-store';
import { inferMealOutcomes, scanMenu, type FuelDeps } from './service';

// FU-AC-1's evening: 21:15 in Sibiu (UTC+3) on 12 September, Q1 vs Petrov at
// 10:00 tomorrow, no pork and no allergies, A$34 of food money left.
const NOW = new Date('2026-09-12T18:15:00Z');
const PLAYER = 'player-1';

function setup(client: MenuExtractionModelClient = createMockMenuExtractionClient()) {
  const store = new MemoryFuelStore();
  store.players.set(PLAYER, {
    id: PLAYER,
    timezone: 'Europe/Bucharest',
    homeCurrency: 'AUD',
    dailyFoodAllowance: 48,
    nextMatchAt: '2026-09-13T07:00:00Z',
    nextMatchLabel: 'Q1 vs Petrov',
  });
  store.profiles.set(PLAYER, {
    exclusions: ['pork'],
    allergies: [],
    preferences: ['fish', 'chicken'],
  });
  store.tournaments.set(PLAYER, {
    id: 't-sibiu',
    name: 'Sibiu Open',
    city: 'Sibiu',
    country: 'ROU',
  });
  store.foodSpend = [14];
  store.rate = { rate: 0.332, date: '2026-09-11' };
  const runs: AgentRunInsert[] = [];
  const agentRuns: AgentRunsDb = {
    async insertAgentRun(row) {
      runs.push(row);
    },
  };
  const deps: FuelDeps = { store, extractionClient: client, agentRuns, now: () => NOW };
  return { store, runs, deps };
}

describe('scanMenu', () => {
  it('reads the Sibiu menu pre-match and returns the three picks (FU-AC-3, FU-AC-4)', async () => {
    const { deps, runs } = setup();
    const result = await scanMenu(deps, PLAYER, [
      { buffer: Buffer.from('page-1'), contentType: 'image/jpeg' },
    ]);
    expect(result.mode).toBe('pre-match');
    expect(result.venueName).toBe('Hotel Continental Sibiu');
    expect(result.dishesRead).toBe(14);
    expect(result.foodMoneyLeft).toBe(34);
    expect(result.picks.map((p) => [p.dishEnglish, p.priceMenu, Math.round(p.priceHome!)])).toEqual(
      [
        ['Grilled chicken breast with rice', 42, 14],
        ['Pasta with tomato and basil sauce', 36, 12],
        ['Beef sour soup', 28, 9],
      ],
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ agentName: 'fuel-menu-scan', status: 'succeeded' });
    expect(runs[0]!.costAmount).toBeGreaterThan(0);
  });

  it('stores hashes and a deletion time, never the photo (FU-13, FU-AC-10)', async () => {
    const { deps, store } = setup();
    const pages = [
      { buffer: Buffer.from('page-1'), contentType: 'image/jpeg' },
      { buffer: Buffer.from('page-2'), contentType: 'image/jpeg' },
    ];
    await scanMenu(deps, PLAYER, pages);
    const scan = store.scans[0]!;
    expect(scan.pages).toBe(2);
    expect(scan.photoHashes).toHaveLength(2);
    expect(scan.photoHashes[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(scan.photosDeletedAt).toBeTruthy();
    expect(JSON.stringify(scan)).not.toContain(Buffer.from('page-1').toString('base64'));
    expect(scan).toMatchObject({
      status: 'ready',
      menuCurrency: 'RON',
      rateDate: '2026-09-11',
      city: 'Sibiu',
      tournamentId: 't-sibiu',
    });
  });

  it('records an unreadable scan with its deletion time and no picks (FU-AC-11)', async () => {
    const { deps, store } = setup(createUnreadableMenuExtractionClient());
    await expect(
      scanMenu(deps, PLAYER, [{ buffer: Buffer.from('blur'), contentType: 'image/jpeg' }]),
    ).rejects.toBeInstanceOf(UnreadableMenuError);
    expect(store.scans).toHaveLength(1);
    expect(store.scans[0]).toMatchObject({ status: 'unreadable', picks: [] });
    expect(store.scans[0]!.photosDeletedAt).toBeTruthy();
  });

  it('reads Practice when no next match is set', async () => {
    const { deps, store } = setup();
    store.players.get(PLAYER)!.nextMatchAt = null;
    const result = await scanMenu(deps, PLAYER, [
      { buffer: Buffer.from('p'), contentType: 'image/jpeg' },
    ]);
    expect(result.mode).toBe('practice');
  });
});

describe('inferMealOutcomes (FU-AC-9)', () => {
  it('infers Worked from a Confident note the next day, once it is 18:00', async () => {
    const { store } = setup();
    store.pending = [
      { id: 'meal-1', playerId: PLAYER, localDate: '2026-09-12', timezone: 'Europe/Bucharest' },
    ];
    store.moods.set(`${PLAYER}:2026-09-13`, { noteMoods: ['confident'], checkInValue: null });

    // 17:00 local on the 13th: not yet.
    expect(await inferMealOutcomes({ store, now: () => new Date('2026-09-13T14:00:00Z') })).toBe(0);
    // 18:00 local.
    expect(await inferMealOutcomes({ store, now: () => new Date('2026-09-13T15:00:00Z') })).toBe(1);
    expect(store.inferred).toEqual([{ mealId: 'meal-1', outcome: 'worked' }]);
  });

  it('leaves the meal alone with no mood signal', async () => {
    const { store } = setup();
    store.pending = [
      { id: 'meal-1', playerId: PLAYER, localDate: '2026-09-12', timezone: 'Europe/Bucharest' },
    ];
    await inferMealOutcomes({ store, now: () => new Date('2026-09-14T09:00:00Z') });
    expect(store.inferred).toEqual([]);
  });
});
