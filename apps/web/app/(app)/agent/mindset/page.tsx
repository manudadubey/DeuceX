import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MindsetClient } from './mindset-client';

const ONBOARDING_NOTE_THRESHOLD = 3;

// Session already gated by (app)/layout.tsx; this only needs the player row
// and the "starts after your third note" gate (PRD-06 section 2), computed
// once here rather than inside the client bundle.
export default async function MindsetCoachPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = typeof data?.claims.sub === 'string' ? data.claims.sub : undefined;
  if (!playerId) redirect('/signin');

  const { data: player } = await supabase
    .from('players')
    .select('id, timezone, patron_language, app_language, tier')
    .eq('id', playerId)
    .single();
  if (!player) redirect('/onboarding');

  const { count } = await supabase
    .from('notes')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', playerId)
    .eq('status', 'saved');
  const started = (count ?? 0) >= ONBOARDING_NOTE_THRESHOLD;

  return (
    <MindsetClient
      playerId={player.id}
      timezone={player.timezone}
      lang={player.patron_language ?? player.app_language}
      // Free-tier gate (MC-20): no onboarding yet (step 1.4) assigns a real
      // tier, so a player with none set reads as Free, the most restrictive
      // default rather than the most permissive one.
      isFree={player.tier !== 'pro' && player.tier !== 'elite'}
      started={started}
    />
  );
}
