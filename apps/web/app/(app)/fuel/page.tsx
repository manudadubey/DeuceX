import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FuelClient } from './fuel-client';

// Session already gated by (app)/layout.tsx. The tier decides the Free lock
// (M-TIER-1, decisions worksheet 15), computed here rather than in the
// client bundle, the same as agent/financial/page.tsx.
export default async function FuelPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = typeof data?.claims.sub === 'string' ? data.claims.sub : undefined;
  if (!playerId) redirect('/signin');

  const { data: player } = await supabase
    .from('players')
    .select(
      'id, tier, timezone, home_currency, daily_food_allowance, next_match_at, next_match_label',
    )
    .eq('id', playerId)
    .single();
  if (!player) redirect('/onboarding');

  return (
    <FuelClient
      playerId={player.id}
      timezone={player.timezone}
      homeCurrency={player.home_currency}
      dailyFoodAllowance={player.daily_food_allowance}
      nextMatchAt={player.next_match_at}
      nextMatchLabel={player.next_match_label}
      isFree={player.tier !== 'pro' && player.tier !== 'elite'}
      focusTake={searchParams.take === '1'}
    />
  );
}
