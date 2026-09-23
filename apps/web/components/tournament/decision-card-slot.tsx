'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@procircuit/ui';
import { createClient } from '@/lib/supabase/client';
import { loadTournamentSnapshot, type TournamentSnapshot } from '@/lib/tournament/load';
import { DecisionCard } from './decision-card';

// PRD-01 section 4.2: "When all shortlisted deadlines are decided the card
// shows the next deadline as 'Nothing due this week · next: <event>,
// <date>'." Renders nothing at all when there is no shortlist yet (the
// Decision tile beside it already says "Your first shortlist arrives
// Sunday 20:00 UTC" — no need to say it twice).
export function DecisionCardSlot({
  playerId,
  homeCurrency,
  weeklyBudget,
}: {
  playerId: string;
  homeCurrency: string;
  weeklyBudget: number | null;
}) {
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const data = await loadTournamentSnapshot(supabase, playerId, homeCurrency, weeklyBudget);
    setSnapshot(data);
  }, [playerId, homeCurrency, weeklyBudget]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!snapshot || snapshot.candidates.length === 0) return null;

  const undecided = snapshot.candidates
    .filter((c) => c.status === 'none' && c.entryDeadline)
    .sort((a, b) => (a.entryDeadline ?? '').localeCompare(b.entryDeadline ?? ''));
  const nearest = undecided[0];

  if (!nearest) {
    const nextEvent = [...snapshot.candidates].sort((a, b) =>
      a.weekStart.localeCompare(b.weekStart),
    )[0];
    return (
      <Card className="p-5">
        <CardHeader className="p-0">
          <CardTitle>Nothing due this week</CardTitle>
          {nextEvent && (
            <CardDescription>
              Next: {nextEvent.name}, {nextEvent.startDate}
            </CardDescription>
          )}
        </CardHeader>
      </Card>
    );
  }

  return (
    <DecisionCard
      playerId={playerId}
      homeCurrency={homeCurrency}
      candidate={nearest}
      reserves={snapshot.reserves}
      netBurn={snapshot.netBurn}
      onDone={load}
    />
  );
}
