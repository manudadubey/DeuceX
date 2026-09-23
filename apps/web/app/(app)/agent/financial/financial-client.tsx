'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Toast,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@procircuit/ui';
import { buildLedgerCsv } from '@procircuit/agents';
import { createClient } from '@/lib/supabase/client';
import { loadFinancialSnapshot, type FinancialSnapshot } from '@/lib/financial/load';
import { RunwayChart } from '@/components/financial/runway-chart';
import { OneThingCard } from '@/components/financial/one-thing-card';
import { BudgetCard } from '@/components/financial/budget-card';
import { ReservesCard } from '@/components/financial/reserves-card';
import { PnlCard } from '@/components/financial/pnl-card';
import { LedgerCard } from '@/components/financial/ledger-card';

export interface FinancialClientProps {
  playerId: string;
  homeCurrency: string;
  weeklyBudget: number | null;
  isFree: boolean;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

const RUNWAY_BADGE: Record<
  'green' | 'amber' | 'red',
  { variant: 'ok' | 'warn' | 'danger'; label: string }
> = {
  green: { variant: 'ok', label: '10 weeks or more' },
  amber: { variant: 'warn', label: 'Under 10 weeks' },
  red: { variant: 'danger', label: 'Under 4 weeks' },
};

export function FinancialClient({
  playerId,
  homeCurrency,
  weeklyBudget,
  isFree,
}: FinancialClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [snapshot, setSnapshot] = useState<FinancialSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<{ title: string } | null>(null);
  const [toastOpen, setToastOpen] = useState(false);

  const showToast = useCallback((title: string) => {
    setToast({ title });
    setToastOpen(true);
  }, []);

  const load = useCallback(async () => {
    const data = await loadFinancialSnapshot(supabase, playerId, homeCurrency, weeklyBudget);
    setSnapshot(data);
    setLoaded(true);
  }, [supabase, playerId, homeCurrency, weeklyBudget]);

  useEffect(() => {
    void load();
  }, [load]);

  const budgetLabels = useMemo(
    () => [...new Set(snapshot?.budgetVsActual.map((r) => r.label) ?? [])],
    [snapshot],
  );

  // PRD-03 F-20 (Must): "a CSV of the selected month or season." This build
  // only ever has the current month's lines loaded (no month selector yet
  // — see docs/BUILD-LOG.md's step 2.2 entry), so Export covers that month.
  const handleExport = () => {
    if (!snapshot) return;
    const monthStart = new Date().toISOString().slice(0, 7);
    const linesThisMonth = snapshot.ledgerLines.filter((l) => l.date.startsWith(monthStart));
    const csv = buildLedgerCsv(linesThisMonth);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `procircuit-ledger-${monthStart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isFree) {
    return (
      <div className="relative">
        <div className="pointer-events-none opacity-40 blur-[1px]">
          <SampleFinancialView homeCurrency={homeCurrency} />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Badge variant="secondary">Pro feature</Badge>
          <Button onClick={() => showToast('Pro trial — coming soon')}>Start Pro trial</Button>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <header className="flex flex-col gap-2 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Financial Agent</h1>
          <p className="text-sm text-muted-foreground">
            Runway, P&amp;L and the one thing to do about it. Updates daily at 07:00 UTC and the
            moment you log an expense.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" title="Runs daily at 07:00 UTC, plus live on each expense.">
            Daily · 07:00 UTC
          </Badge>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={!loaded}>
            Export
          </Button>
        </div>
      </header>

      {!loaded || !snapshot ? null : (
        <>
          <section className="grid grid-cols-4 gap-4 max-[900px]:grid-cols-2">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Runway</div>
              <div className="mt-1 font-mono text-2xl font-medium">
                {Number.isFinite(snapshot.runwayWeeks) ? snapshot.runwayWeeks.toFixed(1) : '—'}{' '}
                <small className="text-sm font-normal text-muted-foreground">wks</small>
              </div>
              <Badge variant={RUNWAY_BADGE[snapshot.runwayColour].variant} className="mt-1">
                {RUNWAY_BADGE[snapshot.runwayColour].label}
              </Badge>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Reserves</div>
              <div className="mt-1 font-mono text-2xl font-medium">
                {formatMoney(snapshot.reserves, homeCurrency)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatMoney(snapshot.netBurn, homeCurrency)}/wk net burn
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">This month so far</div>
              <div className="mt-1 font-mono text-2xl font-medium">
                {formatMoney(snapshot.monthlyPnl.net, homeCurrency)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatMoney(snapshot.monthlyPnl.income, homeCurrency)} in ·{' '}
                {formatMoney(snapshot.monthlyPnl.spend, homeCurrency)} out
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Patron MRR</div>
              <div className="mt-1 font-mono text-2xl font-medium">
                {formatMoney((snapshot.patronWeeklyIncome * 52) / 12, homeCurrency)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                covers {Math.round(snapshot.coverage * 100)}% of weekly spend
              </div>
            </Card>
          </section>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Reserves and runway</CardTitle>
              <CardDescription>
                {snapshot.zeroDate
                  ? `Reaches zero around ${snapshot.zeroDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} at this burn.`
                  : 'Patron income currently covers spend: no zero date at this rate.'}
              </CardDescription>
            </CardHeader>
            <div className="px-6 pb-4">
              <RunwayChart
                cashOnly={snapshot.projection.cashOnly}
                withPending={snapshot.projection.withPending}
                currency={homeCurrency}
              />
            </div>
            <div className="grid grid-cols-3 gap-4 border-t border-border px-6 py-4 text-sm max-[900px]:grid-cols-1">
              <div>
                <div className="text-xs text-muted-foreground">Reserves reach zero</div>
                <div className="font-medium">
                  {snapshot.zeroDate
                    ? snapshot.zeroDate.toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                      })
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">With pending prize</div>
                <div className="font-medium">
                  {Number.isFinite(snapshot.projection.zeroWeekWithPending) &&
                  snapshot.zeroDateWithPending
                    ? `${snapshot.projection.zeroWeekWithPending.toFixed(1)} wks · ${snapshot.zeroDateWithPending.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
                    : 'No pending receivables'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">If nothing changes</div>
                <div className="font-medium">
                  {snapshot.weeksUntilRed === 0
                    ? 'Red now'
                    : Number.isFinite(snapshot.weeksUntilRed)
                      ? `Red in ${snapshot.weeksUntilRed.toFixed(1)} wks`
                      : 'Not heading to red'}
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-4">
            <OneThingCard
              playerId={playerId}
              action={snapshot.action}
              milestone={snapshot.milestone}
              currency={homeCurrency}
              onToast={showToast}
              onSnoozed={load}
            />
          </div>

          <section className="mt-4 grid grid-cols-2 items-start gap-4 max-[900px]:grid-cols-1">
            <BudgetCard
              weeklyBudgetBar={snapshot.weeklyBudgetBar}
              rows={snapshot.budgetVsActual}
              currency={homeCurrency}
            />
            <ReservesCard
              playerId={playerId}
              homeCurrency={homeCurrency}
              reserves={snapshot.reserves}
              lastReserveEntryAt={snapshot.lastReserveEntryAt}
              pendingReceivables={snapshot.pendingReceivables}
              onToast={showToast}
              onSaved={load}
            />
          </section>

          <div className="mt-4">
            <PnlCard pnl={snapshot.monthlyPnl} currency={homeCurrency} />
          </div>

          <div className="mt-4">
            <LedgerCard
              playerId={playerId}
              homeCurrency={homeCurrency}
              ledgerLines={snapshot.ledgerLines}
              pendingReceivables={snapshot.pendingReceivables}
              budgetLabels={budgetLabels}
              isFree={isFree}
              onToast={showToast}
              onSaved={load}
            />
          </div>
        </>
      )}

      {toast && (
        <Toast open={toastOpen} onOpenChange={setToastOpen}>
          <ToastTitle className="font-medium">{toast.title}</ToastTitle>
        </Toast>
      )}
      <ToastViewport />
    </ToastProvider>
  );
}

// M-TIER-1: "the real UI dimmed with a single explanation line and an
// upgrade action; never a blank page." Sample figures only, matching
// PRD-03's own Arya fixture numbers.
function SampleFinancialView({ homeCurrency }: { homeCurrency: string }) {
  return (
    <section className="grid grid-cols-4 gap-4 max-[900px]:grid-cols-2">
      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Runway</div>
        <div className="mt-1 font-mono text-2xl font-medium">
          8.3 <small className="text-sm font-normal text-muted-foreground">wks</small>
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Reserves</div>
        <div className="mt-1 font-mono text-2xl font-medium">{formatMoney(9450, homeCurrency)}</div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted-foreground">This month so far</div>
        <div className="mt-1 font-mono text-2xl font-medium">
          {formatMoney(-1528, homeCurrency)}
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Patron MRR</div>
        <div className="mt-1 font-mono text-2xl font-medium">{formatMoney(612, homeCurrency)}</div>
      </Card>
    </section>
  );
}
