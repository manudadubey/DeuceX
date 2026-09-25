'use client';

import { Badge, Card, CardDescription, CardHeader, CardTitle } from '@deucex/ui';
import type { BudgetVsActualRow, WeeklyBudgetBar } from '@deucex/agents';

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// PRD-03 §4.1's Budget vs actual card (F-16, F-17). Rows come from
// budget_estimates, which stands in for a real tournament reference until
// step 3.1 (see the step 2.2 migration's own design note) — a player names
// their own upcoming trips here, there is no shortlist to pull from yet.
export function BudgetCard({
  weeklyBudgetBar,
  rows,
  currency,
}: {
  weeklyBudgetBar: WeeklyBudgetBar | null;
  rows: BudgetVsActualRow[];
  currency: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget vs actual</CardTitle>
        {weeklyBudgetBar ? (
          <CardDescription>
            Budget {formatMoney(weeklyBudgetBar.budget, currency)}/wk
          </CardDescription>
        ) : (
          <CardDescription>Set a weekly travel budget in onboarding to see this.</CardDescription>
        )}
      </CardHeader>
      <div className="flex flex-col gap-4 px-6">
        {weeklyBudgetBar && (
          <div>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span>{formatMoney(weeklyBudgetBar.spent, currency)} this week</span>
              {weeklyBudgetBar.state === 'red' && (
                <span className="text-danger">
                  {formatMoney(weeklyBudgetBar.overAmount, currency)} over budget
                </span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={
                  weeklyBudgetBar.state === 'red'
                    ? 'h-full rounded-full bg-danger'
                    : weeklyBudgetBar.state === 'amber'
                      ? 'h-full rounded-full bg-warn'
                      : 'h-full rounded-full bg-ok'
                }
                style={{ width: `${weeklyBudgetBar.percent}%` }}
              />
            </div>
            {weeklyBudgetBar.state === 'red' && (
              <p className="mt-1 text-xs text-muted-foreground">
                The agent will trim next week&apos;s shortlist.
              </p>
            )}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trip budgets set yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <span>{row.label}</span>
                {row.variancePercent === null ? (
                  <span className="text-muted-foreground">not started</span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    est {formatMoney(row.estimateAmount, currency)} ·{' '}
                    {formatMoney(row.actualAmount, currency)}
                    <Badge variant={row.over ? 'warn' : 'ok'}>
                      {row.variancePercent > 0 ? '+' : ''}
                      {row.variancePercent}%
                    </Badge>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
