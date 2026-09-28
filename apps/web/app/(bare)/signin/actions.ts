'use server';

import { headers } from 'next/headers';
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

  // The email's link goes back to the site the form was sent from, not the
  // project's one Site URL (localhost in dev), so a sign-in or sign-up from
  // deucex.vercel.app returns there. Needs the email templates to use
  // {{ .RedirectTo }} and the origin in Supabase's Redirect URLs; an origin
  // that isn't on that list falls back to the Site URL, as before.
  const origin = headers().get('origin');
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp(
    origin ? { email, options: { emailRedirectTo: origin } } : { email },
  );

  if (error) {
    redirect(`${back}error=${encodeURIComponent(error.message)}`);
  }

  redirect(`${back}sent=${encodeURIComponent(email)}`);
}
