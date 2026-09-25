import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ContentClient } from './content-client';

// Session already gated by (app)/layout.tsx. The plan decides the Free-tier
// lock (C-AC-12, M-TIER-1), read once here like fans/page.tsx; everything
// else comes from apps/api's GET /content/page.
export default async function ContentAgentPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = typeof data?.claims.sub === 'string' ? data.claims.sub : undefined;
  if (!playerId) redirect('/signin');

  const { data: player } = await supabase
    .from('players')
    .select('id, tier, content_private_names')
    .eq('id', playerId)
    .single();
  if (!player) redirect('/onboarding');

  return (
    <ContentClient
      playerId={player.id}
      isFree={player.tier !== 'pro' && player.tier !== 'elite'}
      privateNames={player.content_private_names}
    />
  );
}
