import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  InvalidLedgerAmountError,
  MissingRateForCurrencyError,
  convertAtRate,
  convertLedgerLine,
  getFxRate,
  insertLedgerLine,
} from './ledger';
import type { Database } from './database.types';

// Same shape as mindset.test.ts's own fakeQuery: proves the filters and
// payload shapes this module builds, not the database itself.
function fakeQuery(result: { data: unknown; error: Error | null }) {
  const query: Record<string, unknown> = {};
  const chain = ['select', 'eq', 'insert', 'order', 'gte', 'lte'];
  for (const method of chain) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.single = vi.fn().mockResolvedValue(result);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  (query as unknown as { then: PromiseLike<unknown>['then'] }).then = (resolve) =>
    Promise.resolve(result).then(resolve as never);
  return query;
}

// M-DATA-1's own acceptance example (PRD-00, TECH-ARCHITECTURE.md section
// 2.1): "an expense of €38.50 on 10 September must show, when the player
// switches home currency from AUD to USD, the USD amount at the 10 Sep
// rate, with the original €38.50 still visible underneath."
describe('M-DATA-1: convertLedgerLine', () => {
  const line = {
    id: 'line-1',
    amount_original: 38.5,
    currency_original: 'EUR',
    fx_rate_date: '2026-09-10',
  };
  // ECB convention: rate_to_eur is "units of currency per 1 EUR."
  const ratesOn10Sep = { AUD: 1.651, USD: 1.1 };

  it('shows the AUD amount at the 10 Sep rate', () => {
    const display = convertLedgerLine(line, 'AUD', ratesOn10Sep);
    expect(display.amountHome).toBeCloseTo(38.5 * 1.651, 5);
    expect(display.amountOriginal).toBe(38.5);
    expect(display.currencyOriginal).toBe('EUR');
    expect(display.fxRateDate).toBe('2026-09-10');
  });

  it('switching home currency to USD shows the USD amount at the same 10 Sep rate, original still underneath', () => {
    const display = convertLedgerLine(line, 'USD', ratesOn10Sep);
    expect(display.amountHome).toBeCloseTo(38.5 * 1.1, 5);
    expect(display.amountOriginal).toBe(38.5);
    expect(display.currencyOriginal).toBe('EUR');
  });

  it('computes the USD figure straight from the original EUR amount, not by re-deriving it from the AUD display', () => {
    // The naive design this PRD explicitly rejects stores only the
    // converted-at-save-time AUD amount, which then has no 10 Sep
    // EUR-to-USD rate to fall back on and would need a second,
    // un-auditable conversion. convertLedgerLine never receives a
    // previously-converted amount at all — only the original line and the
    // rates for its own fx_rate_date — so the two calls below are
    // independent by construction, not just by coincidence of this fixture.
    const toAud = convertLedgerLine(line, 'AUD', ratesOn10Sep);
    const toUsd = convertLedgerLine(line, 'USD', ratesOn10Sep);
    expect(toAud.amountOriginal).toBe(line.amount_original);
    expect(toUsd.amountOriginal).toBe(line.amount_original);
    expect(toUsd.amountHome).toBeCloseTo(38.5 * 1.1, 5);
    expect(toAud.amountHome).toBeCloseTo(38.5 * 1.651, 5);
  });

  it('the original amount and currency are unchanged by either conversion (no stored row is altered)', () => {
    convertLedgerLine(line, 'AUD', ratesOn10Sep);
    convertLedgerLine(line, 'USD', ratesOn10Sep);
    expect(line.amount_original).toBe(38.5);
    expect(line.currency_original).toBe('EUR');
    expect(line.fx_rate_date).toBe('2026-09-10');
  });
});

describe('convertAtRate', () => {
  it('returns the amount unchanged when original and target currencies match', () => {
    expect(convertAtRate(100, 'AUD', 'AUD', {})).toBe(100);
  });

  it('treats EUR as rate 1 without requiring a rates entry', () => {
    expect(convertAtRate(10, 'EUR', 'USD', { USD: 1.1 })).toBeCloseTo(11, 5);
    expect(convertAtRate(11, 'USD', 'EUR', { USD: 1.1 })).toBeCloseTo(10, 5);
  });

  it('throws MissingRateForCurrencyError when a needed rate is absent', () => {
    expect(() => convertAtRate(10, 'AUD', 'USD', { USD: 1.1 })).toThrow(
      MissingRateForCurrencyError,
    );
    expect(() => convertAtRate(10, 'AUD', 'USD', { AUD: 1.65 })).toThrow(
      MissingRateForCurrencyError,
    );
  });
});

describe('insertLedgerLine', () => {
  it('refuses a non-positive amount (F-11: Save without an amount is refused)', async () => {
    const client = {} as SupabaseClient<Database>;
    await expect(
      insertLedgerLine(client, {
        playerId: 'player-1',
        date: '2026-09-10',
        category: 'food',
        what: 'Lunch',
        amountOriginal: 0,
        currencyOriginal: 'EUR',
        source: 'manual',
      }),
    ).rejects.toThrow(InvalidLedgerAmountError);
  });

  it('locks fx_rate_date to the expense date and stores no home-currency amount', async () => {
    const query = fakeQuery({ data: { id: 'line-1' }, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await insertLedgerLine(client, {
      playerId: 'player-1',
      date: '2026-09-10',
      category: 'food',
      what: 'Trattoria da Gino',
      amountOriginal: 38.5,
      currencyOriginal: 'EUR',
      source: 'scanned',
    });

    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        fx_rate_date: '2026-09-10',
        amount_original: 38.5,
        currency_original: 'EUR',
      }),
    );
    const inserted = (query.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(inserted).not.toHaveProperty('amount_home');
  });
});

describe('getFxRate', () => {
  it('returns rate 1 for EUR without querying the table', async () => {
    const from = vi.fn();
    const client = { from } as unknown as SupabaseClient<Database>;

    const rate = await getFxRate(client, '2026-09-10', 'EUR');

    expect(rate).toEqual({ currency: 'EUR', rateToEur: 1, source: 'ecb' });
    expect(from).not.toHaveBeenCalled();
  });

  it('prefers the ecb row over a provisional row for the same date', async () => {
    const query = fakeQuery({
      data: [
        { currency: 'AUD', rate_to_eur: 1.6, source: 'provisional' },
        { currency: 'AUD', rate_to_eur: 1.651, source: 'ecb' },
      ],
      error: null,
    });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    const rate = await getFxRate(client, '2026-09-10', 'AUD');

    expect(rate).toEqual({ currency: 'AUD', rateToEur: 1.651, source: 'ecb' });
  });

  it('falls back to the provisional row when no ecb row exists yet', async () => {
    const query = fakeQuery({
      data: [{ currency: 'AUD', rate_to_eur: 1.6, source: 'provisional' }],
      error: null,
    });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    const rate = await getFxRate(client, '2026-09-10', 'AUD');

    expect(rate).toEqual({ currency: 'AUD', rateToEur: 1.6, source: 'provisional' });
  });

  it('returns null when no row exists at all', async () => {
    const query = fakeQuery({ data: [], error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    const rate = await getFxRate(client, '2026-09-10', 'AUD');

    expect(rate).toBeNull();
  });
});
