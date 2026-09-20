import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// The magic-link email template (Supabase dashboard, Authentication > Email
// Templates > Magic Link) is set to link here with a token_hash, per the
// manual setup checklist in docs/BUILD-LOG.md step 0.3 — Supabase's own
// {{ .ConfirmationURL }} default does a client-side hash redirect that this
// server-side flow doesn't use.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  const redirectTo = request.nextUrl.clone();
  redirectTo.searchParams.delete('token_hash');
  redirectTo.searchParams.delete('type');

  if (tokenHash && type) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirectTo.pathname = '/';
      return NextResponse.redirect(redirectTo);
    }
  }

  redirectTo.pathname = '/signin';
  redirectTo.searchParams.set('error', 'That sign-in link is invalid or has expired.');
  return NextResponse.redirect(redirectTo);
}
