import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProfileShell } from './profile-shell';

// Step 3.1: this route grows its first real piece (M-STG-2's stage pin,
// see profile-shell.tsx). The rest — bio, goals, media kit, social links —
// stays the step-0.5 placeholder until the public-profile editor's own step.
export default async function ProfilePage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = typeof data?.claims.sub === 'string' ? data.claims.sub : undefined;
  if (!playerId) redirect('/signin');

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .maybeSingle();
  if (!player) redirect('/onboarding');

  return <ProfileShell player={player} />;
}
