import type { FinancialLedgerLine } from './types';

export interface ExportableLedgerLine extends FinancialLedgerLine {
  currencyOriginal: string;
  amountOriginal: number;
  source: string;
}

const HEADER = [
  'date',
  'category',
  'what',
  'amount_original',
  'currency_original',
  'rate',
  'amount_home',
  'tournament',
  'source',
];

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// PRD-03 F-20 (Must): "Export produces a CSV of the selected month or
// season with original currency, rate, home amount, category, tournament
// and source per line." rate is derived (amountHome / amountOriginal) for
// display only, the same read-time-only rule ledger.ts's own
// convertLedgerLine follows — never a stored value.
export function buildLedgerCsv(lines: readonly ExportableLedgerLine[]): string {
  const rows = lines.map((l) => {
    const rate = l.amountOriginal !== 0 ? (l.amountHome / l.amountOriginal).toFixed(6) : '';
    return [
      l.date,
      l.category,
      l.what,
      l.amountOriginal,
      l.currencyOriginal,
      rate,
      l.amountHome.toFixed(2),
      l.label ?? '',
      l.source,
    ]
      .map(csvField)
      .join(',');
  });
  return [HEADER.join(','), ...rows].join('\n');
}
