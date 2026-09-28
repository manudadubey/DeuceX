'use server';

import { type EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function confirmSignIn(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get('token_hash') ?? '');
  const type = formData.get('type') as EmailOtpType | null;

  if (!tokenHash || !type) {
    redirect(`/signin?error=${encodeURIComponent('That sign-in link is invalid or has expired.')}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    redirect(`/signin?error=${encodeURIComponent('That sign-in link is invalid or has expired.')}`);
  }

  // A new player has no players row until onboarding's last step writes it
  // (PRD-11: "a new sign-up lands on #/onboarding"); send them straight there
  // rather than to a dashboard that only asks them to finish setup.
  const { data: claims } = await supabase.auth.getClaims();
  const playerId = typeof claims?.claims.sub === 'string' ? claims.claims.sub : undefined;
  if (playerId) {
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('id', playerId)
      .maybeSingle();
    if (!player) redirect('/onboarding');
  }

  redirect('/');
}
