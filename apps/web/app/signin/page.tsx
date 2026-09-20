import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requestMagicLink } from './actions';
import { PasskeySignIn } from './passkey-sign-in';

// Bare shell matching the prototype's #/signin (docs/procircuit-dashboard.html)
// and PRD-12 section 4.11 / ST-21: email field, magic link, optional passkey,
// no password field anywhere (M-ID-1, decisions worksheet 11).
export default async function SignInPage({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string };
}) {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    redirect('/');
  }

  const sent = typeof searchParams.sent === 'string' ? searchParams.sent : undefined;
  const error = typeof searchParams.error === 'string' ? searchParams.error : undefined;

  return (
    <main>
      <div>
        <p>ProCircuit</p>
        <p>Sign in</p>
      </div>

      {sent ? (
        <p>Check {sent} for a link that signs you in.</p>
      ) : (
        <form action={requestMagicLink}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
          <p>
            We email you a link that signs you in. No password to remember, none stored.{' '}
            <PasskeySignIn />
          </p>
          {error ? <p role="alert">{error}</p> : null}
          <button type="submit">Email me a sign-in link</button>
        </form>
      )}

      <p>
        New here? <Link href="/onboarding">Create an account</Link>
      </p>
    </main>
  );
}
