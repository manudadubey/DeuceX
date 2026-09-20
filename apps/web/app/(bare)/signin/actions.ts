'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) {
    redirect(`/signin?error=${encodeURIComponent('Enter an email address.')}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    redirect(`/signin?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/signin?sent=${encodeURIComponent(email)}`);
}
