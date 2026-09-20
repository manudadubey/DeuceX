import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MatchScribeClient } from './match-scribe-client';

// The session itself is already gated by (app)/layout.tsx; this only needs
// the player row (id, timezone) that the recorder, check-in and quota
// display all read.
export default async function MatchScribePage({
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
    .select('id, timezone')
    .eq('id', playerId)
    .single();
  if (!player) redirect('/onboarding');

  const autoStart = searchParams.record === '1';

  return (
    <MatchScribeClient playerId={player.id} timezone={player.timezone} autoStart={autoStart} />
  );
}
