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
  // The sidebar also carries the prototype's plan line, player footer and
  // nav counts, so it needs who the player is, not just the tier.
  const { data: player } = await supabase
    .from('players')
    .select('id, name, tier, tour, tour_rank, verification, country, home_currency, weekly_budget')
    .eq('id', data.claims.sub)
    .maybeSingle();
  const isFree = player?.tier !== 'pro' && player?.tier !== 'elite';

  return (
    <AppShell
      email={email}
      isFree={isFree}
      player={
        player
          ? {
              id: player.id,
              name: player.name,
              tier: player.tier,
              tour: player.tour,
              tourRank: player.verification === 'verified' ? player.tour_rank : null,
              country: player.country,
              homeCurrency: player.home_currency,
              weeklyBudget: player.weekly_budget,
            }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
