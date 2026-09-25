'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Input,
} from '@deucex/ui';
import type { BudgetVsActualRow, WeeklyBudgetBar } from '@deucex/agents';
import { setDailyFoodAllowance } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';

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
// Step 4.3 (owner decision): the daily food amount Fuel's "left for food
// today" chip reads. Player-set in the home currency; Fuel never edits it.
function DailyFoodRow({
  playerId,
  amount,
  currency,
  onSaved,
}: {
  playerId: string;
  amount: number | null;
  currency: string;
  onSaved: (amount: number | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(amount === null ? '' : String(amount));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = value.trim() === '' ? null : Number(value);
    if (parsed !== null && !(parsed > 0)) return;
    setSaving(true);
    try {
      await setDailyFoodAllowance(supabase, playerId, parsed);
      onSaved(parsed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span>
          Daily food money{' '}
          <span className="text-muted-foreground">
            {amount === null ? '· not set' : `· ${formatMoney(amount, currency)} a day`}
          </span>
        </span>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          {amount === null ? 'Set' : 'Edit'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <Field className="min-w-[10rem] flex-1">
        <FieldLabel htmlFor="daily-food">Daily food money ({currency})</FieldLabel>
        <Input
          id="daily-food"
          type="number"
          inputMode="decimal"
          min={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      <Button size="sm" onClick={() => void save()} disabled={saving}>
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </div>
  );
}

export function BudgetCard({
  weeklyBudgetBar,
  rows,
  currency,
  playerId,
  dailyFoodAllowance,
  onFoodAllowanceSaved,
}: {
  weeklyBudgetBar: WeeklyBudgetBar | null;
  rows: BudgetVsActualRow[];
  currency: string;
  playerId: string;
  dailyFoodAllowance: number | null;
  onFoodAllowanceSaved: (amount: number | null) => void;
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
      <div className="flex flex-col gap-4 px-6 pb-6">
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

        <DailyFoodRow
          playerId={playerId}
          amount={dailyFoodAllowance}
          currency={currency}
          onSaved={onFoodAllowanceSaved}
        />
      </div>
    </Card>
  );
}
