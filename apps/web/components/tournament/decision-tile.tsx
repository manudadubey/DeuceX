'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  PulseTileBadge,
  PulseTileLabel,
  PulseTileSub,
  PulseTileValue,
} from '@procircuit/ui';
import { createClient } from '@/lib/supabase/client';
import { daysUntil, loadTournamentSnapshot, type TournamentSnapshot } from '@/lib/tournament/load';

// PRD-01 section 4.3, the Decision tile: "Decision required" with days to
// the nearest undecided deadline, event name, a badge that turns amber
// inside 10 days. Replaces the static "Nothing due" placeholder
// first-week-dashboard.tsx shipped in step 1.4, once a shortlist actually
// exists — same client-tile pattern as RunwayPulseTile beside it.
export function DecisionTile({
  playerId,
  homeCurrency,
  weeklyBudget,
}: {
  playerId: string;
  homeCurrency: string;
  weeklyBudget: number | null;
}) {
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void loadTournamentSnapshot(supabase, playerId, homeCurrency, weeklyBudget).then((data) => {
      if (!cancelled) setSnapshot(data);
    });
    return () => {
      cancelled = true;
    };
  }, [playerId, homeCurrency, weeklyBudget]);

  const now = new Date();
  const undecided = (snapshot?.candidates ?? [])
    .filter((c) => c.status === 'none' && c.entryDeadline)
    .sort((a, b) => (a.entryDeadline ?? '').localeCompare(b.entryDeadline ?? ''));
  const nearest = undecided[0];
  const days = nearest ? daysUntil(nearest.entryDeadline, now) : null;

  return (
    <Link
      href="/agent/tournament"
      className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-card p-5 text-left text-card-foreground no-underline shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.05)] transition-shadow hover:shadow-[0_0_0_1px_var(--ring),0_1px_2px_rgba(0,0,0,.05)] max-sm:p-4"
    >
      <PulseTileLabel>Decision required</PulseTileLabel>
      <PulseTileBadge>
        {!nearest ? (
          <Badge variant="ok">Nothing due</Badge>
        ) : (
          <Badge variant={days != null && days <= 10 ? 'warn' : 'secondary'}>Entry deadline</Badge>
        )}
      </PulseTileBadge>
      {!nearest ? (
        <>
          <PulseTileValue>
            Sun <small>20:00 UTC</small>
          </PulseTileValue>
          <PulseTileSub>
            {snapshot ? 'Nothing due this week.' : 'Your first shortlist arrives then.'}
          </PulseTileSub>
        </>
      ) : (
        <>
          <PulseTileValue>
            {days} <small>days</small>
          </PulseTileValue>
          <PulseTileSub>
            {nearest.name} · confirm or withdraw by {nearest.entryDeadline}
          </PulseTileSub>
        </>
      )}
    </Link>
  );
}
