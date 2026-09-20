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

  redirect('/');
}
