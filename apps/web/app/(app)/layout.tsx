import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { createClient } from '@/lib/supabase/server';

// Gate every route under the app shell on a session, once, here — the ten pages this
// wraps (docs/BUILD-PLAN-CLAUDE-CODE.md step 0.5's route table) no longer each need their
// own redirect.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect('/signin');
  }

  const email = typeof data.claims.email === 'string' ? data.claims.email : undefined;

  return <AppShell email={email}>{children}</AppShell>;
}
