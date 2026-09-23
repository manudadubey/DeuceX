'use client';

import { Card, CardDescription, CardHeader, CardTitle } from '@procircuit/ui';
import type { MonthlyPnl } from '@procircuit/agents';

function formatMoney(amount: number, currency: string): string {
  const sign = amount < 0 ? '−' : '';
  return (
    sign +
    new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount))
  );
}

// PRD-03 §4.1's Monthly P&L card (F-19), scoped this step to the current
// month only rather than the prototype's six-month chart — the same kind
// of documented narrowing components/mindset/mood-chart.tsx already made
// against its own prototype ("no shaded tournament weeks..."), not a bug.
// Pending receivables and gross MRR are structurally excluded from
// `pnl.income` (packages/agents/src/financial/pnl.ts never takes them as
// an argument at all), the decisions-worksheet-7 fix this step's own "Done
// when" bar names directly.
export function PnlCard({ pnl, currency }: { pnl: MonthlyPnl; currency: string }) {
  const monthLabel = new Intl.DateTimeFormat('en-AU', { month: 'long' }).format(new Date());

  return (
    <Card>
      <CardHeader>
        <CardTitle>{monthLabel} so far</CardTitle>
        <CardDescription>
          Received income and spend, pending prizes excluded until received.
        </CardDescription>
      </CardHeader>
      <div className="grid grid-cols-3 gap-4 px-6 text-center">
        <div>
          <div className="text-xs text-muted-foreground">In</div>
          <div className="font-mono text-lg font-medium">{formatMoney(pnl.income, currency)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Out</div>
          <div className="font-mono text-lg font-medium">{formatMoney(-pnl.spend, currency)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Net</div>
          <div className="font-mono text-lg font-medium">{formatMoney(pnl.net, currency)}</div>
        </div>
      </div>
    </Card>
  );
}
