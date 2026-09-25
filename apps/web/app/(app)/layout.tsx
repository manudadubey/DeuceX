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

  // The quick-actions sheet shows "Scan a menu" locked on Free (decisions
  // worksheet 15), so the shell needs the tier. No tier yet reads as Free,
  // the same conservative default every agent page uses.
  const { data: player } = await supabase
    .from('players')
    .select('tier')
    .eq('id', data.claims.sub)
    .maybeSingle();
  const isFree = player?.tier !== 'pro' && player?.tier !== 'elite';

  return (
    <AppShell email={email} isFree={isFree}>
      {children}
    </AppShell>
  );
}
