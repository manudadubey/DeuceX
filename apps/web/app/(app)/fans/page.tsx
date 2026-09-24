import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FansClient } from './fans-client';

// Session already gated by (app)/layout.tsx. The player's plan decides the
// Free-tier lock (M-TIER-1), the Pro cap and the fee rate, so it's read
// once here, server-side, like agent/financial/page.tsx.
export default async function FansPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = typeof data?.claims.sub === 'string' ? data.claims.sub : undefined;
  if (!playerId) redirect('/signin');

  const { data: player } = await supabase
    .from('players')
    .select('id, name, home_currency, tier')
    .eq('id', playerId)
    .single();
  if (!player) redirect('/onboarding');

  const plan = player.tier === 'pro' || player.tier === 'elite' ? player.tier : 'free';
  return (
    <FansClient
      playerId={player.id}
      playerName={player.name}
      homeCurrency={player.home_currency}
      plan={plan}
    />
  );
}
