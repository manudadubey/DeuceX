import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TournamentClient } from './tournament-client';

// Session already gated by (app)/layout.tsx; this only needs the player's
// home currency, weekly budget, blocked dates and tier for the Free-tier
// lock (decisions worksheet 14) — same pattern as agent/financial/page.tsx.
export default async function TournamentAgentPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = typeof data?.claims.sub === 'string' ? data.claims.sub : undefined;
  if (!playerId) redirect('/signin');

  const { data: player } = await supabase
    .from('players')
    .select('id, home_currency, weekly_budget, blocked_dates, tier')
    .eq('id', playerId)
    .single();
  if (!player) redirect('/onboarding');

  return (
    <TournamentClient
      playerId={player.id}
      homeCurrency={player.home_currency}
      weeklyBudget={player.weekly_budget}
      blockedDates={player.blocked_dates}
      isFree={player.tier !== 'pro' && player.tier !== 'elite'}
    />
  );
}
