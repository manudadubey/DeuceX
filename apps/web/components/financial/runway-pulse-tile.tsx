'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import {
  Badge,
  PulseTileBadge,
  PulseTileLabel,
  PulseTileMeter,
  PulseTileSub,
  PulseTileValue,
} from '@deucex/ui';
import { createClient } from '@/lib/supabase/client';
import { loadFinancialSnapshot, type FinancialSnapshot } from '@/lib/financial/load';

const BADGE: Record<
  FinancialSnapshot['runwayColour'],
  { variant: 'ok' | 'warn' | 'danger'; label: string }
> = {
  green: { variant: 'ok', label: '10 weeks or more' },
  amber: { variant: 'warn', label: 'Under 10 weeks' },
  red: { variant: 'danger', label: 'Under 4 weeks' },
};

// The meter fills at 20 weeks (the prototype's 8.3 weeks draws at 41.5%).
const METER_FULL_WEEKS = 20;
// Past a year the decimal stops meaning anything; the prototype never shows one.
const RUNWAY_CAP_WEEKS = 52;

const VALUE_TONE: Record<FinancialSnapshot['runwayColour'], string> = {
  green: '',
  amber: 'text-warn',
  red: 'text-danger',
};

const METER_TONE: Record<FinancialSnapshot['runwayColour'], string> = {
  green: 'bg-ok',
  amber: 'bg-warn',
  red: 'bg-danger',
};

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// The first-week dashboard's own Runway tile (PRD-11 §4.2, PRD-03 §4.2),
// build plan step 2.2's "dashboard runway tile." Replaces the static "Not
// set up" placeholder first-week-dashboard.tsx shipped in step 1.4, once a
// balance actually exists — a client component (like the CheckInCard beside
// it) since the figures are read live and directly, the same split
// financial-client.tsx's own header comment explains.
export function RunwayPulseTile({
  playerId,
  homeCurrency,
  weeklyBudget,
}: {
  playerId: string;
  homeCurrency: string;
  weeklyBudget: number | null;
}) {
  const [snapshot, setSnapshot] = useState<FinancialSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void loadFinancialSnapshot(supabase, playerId, homeCurrency, weeklyBudget).then((data) => {
      if (!cancelled) setSnapshot(data);
    });
    return () => {
      cancelled = true;
    };
  }, [playerId, homeCurrency, weeklyBudget]);

  const notSetUp = !snapshot || snapshot.lastReserveEntryAt === null;

  return (
    <Link
      href="/agent/financial"
      data-bl-card=""
      className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-card p-5 text-left text-card-foreground no-underline shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.05)] transition-shadow hover:shadow-[0_0_0_1px_var(--ring),0_1px_2px_rgba(0,0,0,.05)] max-sm:p-4"
    >
      <PulseTileLabel>
        <Wallet aria-hidden="true" className="size-4" />
        Runway
      </PulseTileLabel>
      <PulseTileBadge>
        {notSetUp ? (
          <Badge variant="secondary">Not set up</Badge>
        ) : (
          <Badge variant={BADGE[snapshot.runwayColour].variant}>
            {BADGE[snapshot.runwayColour].label}
          </Badge>
        )}
      </PulseTileBadge>
      {notSetUp ? (
        <>
          <PulseTileValue className="text-muted-foreground">
            – <small>weeks</small>
          </PulseTileValue>
          <PulseTileSub>
            Enter today&apos;s cash balance and the Financial Agent runs tomorrow at 07:00. Takes a
            minute.
          </PulseTileSub>
          <PulseTileMeter percent={0} />
        </>
      ) : (
        <>
          <PulseTileValue className={VALUE_TONE[snapshot.runwayColour]}>
            {!Number.isFinite(snapshot.runwayWeeks)
              ? '–'
              : snapshot.runwayWeeks > RUNWAY_CAP_WEEKS
                ? `${RUNWAY_CAP_WEEKS}+`
                : snapshot.runwayWeeks.toFixed(1)}{' '}
            <small>weeks</small>
          </PulseTileValue>
          <PulseTileSub>
            {formatMoney(snapshot.reserves, homeCurrency)} reserves ·{' '}
            {formatMoney(snapshot.netBurn, homeCurrency)}/wk net burn
          </PulseTileSub>
          <PulseTileMeter
            percent={
              Number.isFinite(snapshot.runwayWeeks)
                ? Math.min(100, Math.max(0, (snapshot.runwayWeeks / METER_FULL_WEEKS) * 100))
                : 100
            }
            fillClassName={METER_TONE[snapshot.runwayColour]}
          />
        </>
      )}
    </Link>
  );
}
