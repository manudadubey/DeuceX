'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Badge,
  Card,
  CardFooter,
  Empty,
  HelpMark,
  PulseTileBadge,
  PulseTileLabel,
  PulseTileMeter,
  PulseTileSpark,
  PulseTileSub,
  PulseTileValue,
  buttonVariants,
  cn,
} from '@deucex/ui';
import { Users } from 'lucide-react';
import { formatPatronMoney, type FansPlan } from '@deucex/agents';
import { createClient } from '@/lib/supabase/client';
import { loadFansSnapshot, type FansSnapshot } from '@/lib/fans/load';
import { AgentHeader } from '@/components/dashboard/agent-header';

// PRD-04 section 4.2: the dashboard's Patrons pulse tile and Patrons card.
// Both read the same live snapshot /fans does. "Since last login" needs a
// last-seen timestamp no table records yet, so the tile counts the last
// seven days instead and says so in its label rather than implying a
// login-relative window it can't compute.

const DAY_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, Promise<FansSnapshot>>();

function useFansSnapshot(playerId: string, plan: FansPlan, homeCurrency: string) {
  const [snapshot, setSnapshot] = useState<FansSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    const key = `${playerId}:${plan}:${homeCurrency}`;
    if (!cache.has(key)) {
      cache.set(key, loadFansSnapshot(createClient(), { playerId, plan, homeCurrency }));
      setTimeout(() => cache.delete(key), 30_000);
    }
    cache
      .get(key)!
      .then((s) => {
        if (!cancelled) setSnapshot(s);
      })
      .catch(() => cache.delete(key));
    return () => {
      cancelled = true;
    };
  }, [playerId, plan, homeCurrency]);
  return snapshot;
}

const TILE_CLASS =
  'grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-card p-5 text-left text-card-foreground no-underline shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.05)] transition-shadow hover:shadow-[0_0_0_1px_var(--ring),0_1px_2px_rgba(0,0,0,.05)] max-sm:p-4';

export function PatronsPulseTile({
  playerId,
  plan,
  homeCurrency,
}: {
  playerId: string;
  plan: FansPlan;
  homeCurrency: string;
}) {
  const snapshot = useFansSnapshot(playerId, plan, homeCurrency);
  const live =
    snapshot?.programme?.kycStatus === 'complete' && snapshot.tiers.some((t) => t.published);

  if (!snapshot || !live) {
    return (
      <Link href="/fans" className={TILE_CLASS}>
        <PulseTileLabel>
          <Users aria-hidden="true" className="size-4" />
          Patrons
        </PulseTileLabel>
        <PulseTileBadge>
          <Badge variant="secondary">Page not live</Badge>
        </PulseTileBadge>
        <PulseTileValue className="text-muted-foreground">
          0 <small>patrons</small>
        </PulseTileValue>
        <PulseTileSub>
          Build your public page and switch on the tiers. Most players get their first patron from
          people who already know them.
        </PulseTileSub>
        <PulseTileMeter percent={0} />
      </Link>
    );
  }

  const weekAgo = Date.now() - 7 * DAY_MS;
  const recent = snapshot.events.filter((e) => new Date(e.at).getTime() >= weekAgo);
  const joined = recent.filter((e) => e.kind === 'join').length;
  const left = recent.filter((e) => e.kind === 'leave').length;
  // Monthly patron income, oldest first, as bar heights (the current month lime).
  const peak = Math.max(0, ...snapshot.mrr.history.map((m) => m.gross));
  const spark =
    peak > 0 ? snapshot.mrr.history.map((m) => Math.max(8, (m.gross / peak) * 100)) : [];
  return (
    <Link href="/fans" className={TILE_CLASS}>
      <PulseTileLabel>
        <Users aria-hidden="true" className="size-4" />
        Patrons · last 7 days
        <HelpMark label="People, not money: who joined or left your patron page this week. Revenue lives in Fans and the Financial Agent." />
      </PulseTileLabel>
      <PulseTileBadge>
        <Badge variant={left > joined ? 'warn' : 'ok'}>{left > joined ? 'Watch' : 'Healthy'}</Badge>
      </PulseTileBadge>
      <PulseTileValue>
        +{joined} <small>new, {left} churned</small>
      </PulseTileValue>
      <PulseTileSub>
        {snapshot.kpi.active} {snapshot.kpi.active === 1 ? 'patron' : 'patrons'} ·{' '}
        {snapshot.tiers.map((t) => `${t.name} ${t.activeCount}`).join(' · ')}
      </PulseTileSub>
      {spark.length > 1 ? <PulseTileSpark values={spark} highlightLast /> : null}
    </Link>
  );
}

export function PatronsCard({
  playerId,
  plan,
  homeCurrency,
}: {
  playerId: string;
  plan: FansPlan;
  homeCurrency: string;
}) {
  const snapshot = useFansSnapshot(playerId, plan, homeCurrency);
  const live =
    snapshot?.programme?.kycStatus === 'complete' && snapshot.tiers.some((t) => t.published);

  const summary =
    live && snapshot
      ? `${snapshot.kpi.active} ${snapshot.kpi.active === 1 ? 'person' : 'people'} · ${snapshot.tiers.map((t) => `${t.name} ${t.activeCount}`).join(' · ')}`
      : 'Page not live';

  return (
    <Card id="fwPatron" className="self-stretch">
      <AgentHeader icon={<Users />} title="Patrons" sub={summary} />
      {!live || !snapshot ? (
        <Empty title="No patrons yet">
          Start with the people who already know you: family, clubs, the coaches who got you here.
        </Empty>
      ) : (
        <div className="grid gap-3 px-6 text-sm max-sm:px-5">
          {snapshot.events.slice(0, 3).map((e) => (
            <div key={e.id} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  'size-2 translate-y-[-1px] rounded-full',
                  e.kind === 'leave' || e.kind === 'card_failed' || e.kind === 'downgrade'
                    ? 'bg-danger'
                    : 'bg-ok',
                )}
              />
              <span className="min-w-0">{e.title}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {new Date(e.at).toLocaleDateString('en-AU', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
              {e.attribution ? (
                <span className="col-start-2 col-end-4 text-xs text-muted-foreground">
                  {e.attribution}
                </span>
              ) : null}
            </div>
          ))}
          {snapshot.events.length === 0 ? (
            <p className="text-muted-foreground">No joins or departures in the last 30 days.</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Publishing keeps patrons. MRR {formatPatronMoney(snapshot.mrr.current, homeCurrency)},
            secondary.
          </p>
        </div>
      )}
      <CardFooter className="mt-auto">
        <Link href="/fans" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
          {live ? 'Open Fans' : 'Build the page'}
        </Link>
      </CardFooter>
    </Card>
  );
}
