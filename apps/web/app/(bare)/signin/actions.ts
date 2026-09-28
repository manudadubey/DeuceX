'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  // "Create an account" uses the same email link (signInWithOtp creates the
  // user on first use); the mode only keeps the page's wording on a redirect.
  const back = formData.get('mode') === 'new' ? '/signin?new=1&' : '/signin?';
  if (!email) {
    redirect(`${back}error=${encodeURIComponent('Enter an email address.')}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    redirect(`${back}error=${encodeURIComponent(error.message)}`);
  }

  redirect(`${back}sent=${encodeURIComponent(email)}`);
}
