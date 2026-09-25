'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  buttonVariants,
  Toast,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@procircuit/ui';
import type { FansPlan } from '@procircuit/agents';
import { createClient } from '@/lib/supabase/client';
import { refreshConnectAccount } from '@/lib/fans/api';
import { loadFansSnapshot, sampleFansSnapshot, type FansSnapshot } from '@/lib/fans/load';
import {
  FansKpis,
  MovementCard,
  MrrCard,
  PausedBillingCard,
  PayoutsCard,
  SetupCard,
  WaitlistCard,
} from '@/components/fans/fans-cards';
import { PeopleCard } from '@/components/fans/people-card';
import { TiersCard } from '@/components/fans/tiers-card';

const NUMBER_WORDS = [
  'No one',
  'One person',
  'Two people',
  'Three people',
  'Four people',
  'Five people',
  'Six people',
  'Seven people',
  'Eight people',
  'Nine people',
  'Ten people',
  'Eleven people',
  'Twelve people',
];

function lede(active: number): string {
  if (active === 0)
    return 'The people who back you before the results do. This page is about them first, and the money second.';
  const who = NUMBER_WORDS[active] ?? `${active} people`;
  return `${who} who backed you before the results did. This page is about them first, and the money second.`;
}

// PRD-04 section 4.1, top to bottom in the prototype's order: KPI row, Last
// 30 days and Tiers, People, then Payouts and MRR last "on purpose".
export function FansClient({
  playerId,
  playerName,
  homeCurrency,
  plan,
}: {
  playerId: string;
  playerName: string;
  homeCurrency: string;
  plan: FansPlan;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [snapshot, setSnapshot] = useState<FansSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const isFree = plan === 'free';

  const showToast = useCallback((title: string) => {
    setToast(title);
    setToastOpen(true);
  }, []);

  const load = useCallback(async () => {
    try {
      setSnapshot(await loadFansSnapshot(supabase, { playerId, plan, homeCurrency }));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Fans could not load.');
    }
  }, [supabase, playerId, plan, homeCurrency]);

  useEffect(() => {
    if (isFree) return;
    const params = new URLSearchParams(window.location.search);
    const back = params.get('stripe');
    void (async () => {
      if (back === 'return' || back === 'refresh') {
        try {
          const { kycStatus } = await refreshConnectAccount(supabase);
          if (back === 'return') {
            showToast(
              kycStatus === 'complete'
                ? 'Stripe has verified you'
                : 'Stripe is still checking your details',
            );
          }
        } catch {
          // Leave the last-known state on screen; the page says when Stripe last refreshed.
        }
        window.history.replaceState(null, '', '/fans');
      }
      await load();
    })();
  }, [isFree, load, supabase, showToast]);

  const copyLink = async () => {
    if (!snapshot?.programme) return;
    const url = `${window.location.origin}/p/${snapshot.programme.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(`Copied ${url.replace(/^https?:\/\//, '')}`);
    } catch {
      showToast(url);
    }
  };

  const view = isFree ? sampleFansSnapshot(homeCurrency) : snapshot;
  const ready = view?.programme?.kycStatus === 'complete';

  return (
    <ToastProvider>
      <header className="flex flex-col gap-2 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fans</h1>
          <p className="text-sm text-muted-foreground">{lede(view?.kpi.active ?? 0)}</p>
        </div>
        <div className="flex items-center gap-2">
          {view?.programme ? (
            <Button size="sm" variant="outline" onClick={copyLink}>
              Copy patron page link
            </Button>
          ) : null}
          <Link href="/agent/content" className={buttonVariants({ size: 'sm' })}>
            Post an update
          </Link>
        </div>
      </header>

      {loadError ? <p className="text-sm text-danger">{loadError}</p> : null}

      {isFree ? (
        <div className="relative">
          <div className="pointer-events-none grid gap-4 opacity-40 blur-[1px]" aria-hidden="true">
            <FansKpis snapshot={view!} />
            <PeopleCard
              playerId={playerId}
              patrons={view!.patrons}
              tiers={view!.tiers}
              locked
              onToast={showToast}
            />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-start gap-3 pt-24 text-center">
            <Badge variant="secondary">Pro feature</Badge>
            <p className="max-w-sm text-sm">
              Patron tiers, payouts and drafted notes are on Pro. Your public profile stays live on
              Free.
            </p>
            <Button onClick={() => showToast('Pro trial · coming soon')}>Start Pro trial</Button>
          </div>
        </div>
      ) : !view ? null : !ready ? (
        <div className="grid gap-4">
          <SetupCard snapshot={view} playerId={playerId} />
          <TiersCard
            playerId={playerId}
            tiers={view.tiers}
            currency={homeCurrency}
            canEdit={view.programme?.kycStatus !== undefined && view.programme !== null}
            onChanged={load}
            onToast={showToast}
          />
        </div>
      ) : (
        <div className="grid gap-4">
          <FansKpis snapshot={view} />
          <section className="grid grid-cols-[1.4fr_1fr] gap-4 max-[1000px]:grid-cols-1">
            <MovementCard snapshot={view} />
            <TiersCard
              playerId={playerId}
              tiers={view.tiers}
              currency={homeCurrency}
              canEdit
              onChanged={load}
              onToast={showToast}
            />
          </section>
          <PausedBillingCard
            snapshot={view}
            playerId={playerId}
            playerName={playerName}
            onChanged={load}
            onToast={showToast}
          />
          <WaitlistCard snapshot={view} playerId={playerId} onChanged={load} onToast={showToast} />
          <PeopleCard
            playerId={playerId}
            patrons={view.patrons}
            tiers={view.tiers}
            onToast={showToast}
          />
          <section className="grid grid-cols-[1.4fr_1fr] gap-4 max-[1000px]:grid-cols-1">
            <PayoutsCard snapshot={view} playerId={playerId} />
            <MrrCard snapshot={view} />
          </section>
        </div>
      )}

      {toast ? (
        <Toast open={toastOpen} onOpenChange={setToastOpen}>
          <ToastTitle className="font-medium">{toast}</ToastTitle>
        </Toast>
      ) : null}
      <ToastViewport />
    </ToastProvider>
  );
}
