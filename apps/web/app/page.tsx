// Placeholder route. The real shell (sidebar, topbar, mobile tab bar, hash
// routing ported to Next.js routing) lands in build plan step 0.5. Until
// then this is just enough to prove step 0.3's auth mechanism end to end:
// gated on a session, shows who's signed in, and offers passkey
// registration and sign-out (there's no Settings pane to host those yet).
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PasskeyRegister } from './passkey-register';

export default async function HomePage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect('/signin');
  }

  const email = typeof data.claims.email === 'string' ? data.claims.email : undefined;

  return (
    <main>
      <p>Signed in{email ? ` as ${email}` : ''}.</p>
      <p>ProCircuit — build in progress</p>
      <PasskeyRegister />
      <form action="/auth/signout" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
