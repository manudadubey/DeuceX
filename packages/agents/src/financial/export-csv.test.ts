import { describe, expect, it } from 'vitest';
import { buildLedgerCsv, type ExportableLedgerLine } from './export-csv';

describe('buildLedgerCsv (PRD-03 F-20)', () => {
  it('includes original currency, a derived rate, home amount, category, tournament and source', () => {
    const lines: ExportableLedgerLine[] = [
      {
        id: '1',
        date: '2026-09-10',
        category: 'food',
        what: 'Trattoria da Gino',
        amountHome: 64,
        label: 'Genoa',
        amountOriginal: 38.5,
        currencyOriginal: 'EUR',
        source: 'scanned',
      },
    ];

    const csv = buildLedgerCsv(lines);
    const [header, row] = csv.split('\n');

    expect(header).toBe(
      'date,category,what,amount_original,currency_original,rate,amount_home,tournament,source',
    );
    expect(row).toBe('2026-09-10,food,Trattoria da Gino,38.5,EUR,1.662338,64.00,Genoa,scanned');
  });

  it('quotes fields containing a comma', () => {
    const lines: ExportableLedgerLine[] = [
      {
        id: '1',
        date: '2026-09-11',
        category: 'other',
        what: 'Coffee, tea',
        amountHome: 10,
        label: null,
        amountOriginal: 10,
        currencyOriginal: 'AUD',
        source: 'manual',
      },
    ];

    const csv = buildLedgerCsv(lines);
    expect(csv).toContain('"Coffee, tea"');
  });
});
