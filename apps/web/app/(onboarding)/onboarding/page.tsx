import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { finishOnboardingAction } from './actions';

// OB-17 ("Replay setup ... without discarding existing answers"): a player
// who already finished onboarding once gets the wizard pre-filled from
// their existing players row, the closest honest stand-in for a dedicated
// in-progress draft (PRD-11 section 3 deliberately keeps no such draft —
// see packages/db/src/players.ts's design note).
export default async function OnboardingPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = typeof data?.claims.sub === 'string' ? data.claims.sub : undefined;
  const email = typeof data?.claims.email === 'string' ? data.claims.email : undefined;
  if (!playerId || !email) redirect('/signin');

  const { data: existingPlayer } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .maybeSingle();

  return (
    <OnboardingWizard
      email={email}
      existingPlayer={existingPlayer}
      onFinish={finishOnboardingAction}
    />
  );
}
