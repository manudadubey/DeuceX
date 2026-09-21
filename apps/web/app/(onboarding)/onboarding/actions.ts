'use server';

import { redirect } from 'next/navigation';
import { type FinishOnboardingInput, finishOnboarding } from '@procircuit/db';
import { createClient } from '@/lib/supabase/server';

export type FinishOnboardingFormInput = Omit<
  FinishOnboardingInput,
  'playerId' | 'email' | 'timezone'
>;

// The single write onboarding makes (PRD-11 section 3): everything above
// this — the ranking lookup, every field the player types across the four
// steps — stays client-side state until this one call. RLS
// (players_insert_own, agent_schedules_insert_own from the step 1.4
// migration) is the real authorization; this action only supplies the
// signed-in player's own id and email, never trusting a client-supplied one.
export async function finishOnboardingAction(input: FinishOnboardingFormInput): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = typeof data?.claims.sub === 'string' ? data.claims.sub : undefined;
  const email = typeof data?.claims.email === 'string' ? data.claims.email : undefined;
  if (!playerId || !email) redirect('/signin');

  await finishOnboarding(supabase, { ...input, playerId, email });

  redirect('/');
}
