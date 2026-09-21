import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import { describe, expect, it, vi } from 'vitest';
import { fetchAndStoreDailyRates } from './service';
import { createFixtureEcbAdapter } from './fixture-adapter';

// A tiny scripted fake: each .from() call gets the next queued response for
// the marker-row lookup (maybeSingle) or records the insert payload.
function fakeDb(markerLookups: (unknown | null)[]) {
  const inserted: Record<string, unknown>[][] = [];
  let lookupCall = 0;

  const client = {
    from: vi.fn().mockImplementation(() => {
      const query: Record<string, unknown> = {};
      const chain = ['select', 'eq'];
      for (const method of chain) query[method] = vi.fn().mockReturnValue(query);
      query.maybeSingle = vi.fn().mockImplementation(() => {
        const data = markerLookups[Math.min(lookupCall++, markerLookups.length - 1)];
        return Promise.resolve({ data, error: null });
      });
      query.insert = vi.fn().mockImplementation((rows: Record<string, unknown>[]) => {
        inserted.push(rows);
        return Promise.resolve({ data: rows, error: null });
      });
      return query;
    }),
  } as unknown as SupabaseClient<Database>;

  return { client, inserted };
}

describe('fetchAndStoreDailyRates', () => {
  it('inserts an ecb row for every currency when the feed date matches today', async () => {
    const { client, inserted } = fakeDb([null]); // no ecb row for today yet
    const adapter = createFixtureEcbAdapter({
      date: '2026-09-19',
      rates: { AUD: 1.651, USD: 1.085 },
    });

    const result = await fetchAndStoreDailyRates(client, adapter, {
      now: new Date('2026-09-19T20:00:00Z'),
    });

    expect(result).toEqual({ inserted: 'ecb', date: '2026-09-19' });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currency: 'AUD',
          rate_to_eur: 1.651,
          source: 'ecb',
          date: '2026-09-19',
        }),
        expect.objectContaining({
          currency: 'USD',
          rate_to_eur: 1.085,
          source: 'ecb',
          date: '2026-09-19',
        }),
      ]),
    );
  });

  it('inserts a provisional row when the feed is still dated a prior day (weekend or before publish)', async () => {
    const { client, inserted } = fakeDb([null, null]); // no ecb row, no provisional row yet
    const adapter = createFixtureEcbAdapter({ date: '2026-09-18', rates: { AUD: 1.65 } });

    const result = await fetchAndStoreDailyRates(client, adapter, {
      now: new Date('2026-09-19T08:00:00Z'),
    });

    expect(result).toEqual({ inserted: 'provisional', date: '2026-09-19' });
    expect(inserted[0]).toEqual([
      expect.objectContaining({
        currency: 'AUD',
        rate_to_eur: 1.65,
        source: 'provisional',
        date: '2026-09-19',
      }),
    ]);
  });

  it('is a no-op once an ecb row for today already exists', async () => {
    const { client, inserted } = fakeDb([{ currency: 'USD' }]); // ecb row already present
    const onFetch = vi.fn();
    const adapter = createFixtureEcbAdapter(undefined, onFetch);

    const result = await fetchAndStoreDailyRates(client, adapter, {
      now: new Date('2026-09-19T20:00:00Z'),
    });

    expect(result).toEqual({ inserted: 'none', date: '2026-09-19' });
    expect(onFetch).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it('is a no-op when a provisional row for today already exists and the feed still has not caught up', async () => {
    const { client, inserted } = fakeDb([null, { currency: 'USD' }]); // no ecb row, but provisional already there
    const adapter = createFixtureEcbAdapter({ date: '2026-09-18', rates: { AUD: 1.65 } });

    const result = await fetchAndStoreDailyRates(client, adapter, {
      now: new Date('2026-09-19T08:00:00Z'),
    });

    expect(result).toEqual({ inserted: 'none', date: '2026-09-19' });
    expect(inserted).toHaveLength(0);
  });
});
