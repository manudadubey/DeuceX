import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FinancialClient } from './financial-client';

// Session already gated by (app)/layout.tsx; this only needs the player's
// home currency, weekly budget (set during onboarding, step 1.4) and tier
// for the Free-tier lock (M-TIER-1), computed once here rather than inside
// the client bundle — same pattern as agent/mindset/page.tsx.
export default async function FinancialAgentPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = typeof data?.claims.sub === 'string' ? data.claims.sub : undefined;
  if (!playerId) redirect('/signin');

  const { data: player } = await supabase
    .from('players')
    .select('id, home_currency, weekly_budget, daily_food_allowance, tier')
    .eq('id', playerId)
    .single();
  if (!player) redirect('/onboarding');

  return (
    <FinancialClient
      playerId={player.id}
      homeCurrency={player.home_currency}
      weeklyBudget={player.weekly_budget}
      dailyFoodAllowance={player.daily_food_allowance}
      // Free-tier gate (M-TIER-1): a player with no tier set yet reads as
      // Free, the same conservative default mindset/page.tsx already uses.
      isFree={player.tier !== 'pro' && player.tier !== 'elite'}
    />
  );
}
