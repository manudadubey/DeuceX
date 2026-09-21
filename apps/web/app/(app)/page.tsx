import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Empty,
  PulseTileBadge,
  PulseTileLabel,
  PulseTileSub,
  PulseTileValue,
} from '@procircuit/ui';
import { createClient } from '@/lib/supabase/server';
import { CheckInCard } from '@/components/mindset/check-in-card';

// The "three answers" dashboard (PROCIRCUIT-CONTEXT.md 5.1), with honest empty states:
// no ranking, agent or fan data exists yet (that's Phase 1 onward), so every tile says so
// and links to the placeholder route that will eventually fill it, rather than showing
// fixture numbers.
const TILES = [
  {
    href: '/agent/financial',
    label: 'Runway',
    sub: 'Appears once the Financial Agent is connected.',
  },
  {
    href: '/agent/tournament',
    label: 'Decision required',
    sub: 'Tournament decisions appear once your ranking is verified.',
  },
  {
    href: '/fans',
    label: 'Patrons since last login',
    sub: 'Appears once Fans is connected.',
  },
] as const;

// The mood row (build plan step 1.3: "the dashboard mood row") is the one
// piece of the real three-answers dashboard this step adds; the rest of
// this page's wiring to real player data is step 1.4's job (First-week
// dashboard and onboarding).
export default async function DashboardPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = typeof data?.claims.sub === 'string' ? data.claims.sub : undefined;
  if (!playerId) redirect('/signin');

  const { data: player } = await supabase
    .from('players')
    .select('id, timezone')
    .eq('id', playerId)
    .maybeSingle();

  return (
    <>
      <Empty title="Your ranking hasn't been verified yet">
        Finish onboarding to verify your ranking and unlock the dashboard.{' '}
        <Link href="/onboarding" className="font-medium text-foreground underline">
          Continue onboarding
        </Link>
      </Empty>

      <div className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-1">
        {TILES.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-card p-5 text-left text-card-foreground no-underline shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.05)] transition-shadow hover:shadow-[0_0_0_1px_var(--ring),0_1px_2px_rgba(0,0,0,.05)] max-sm:p-4"
          >
            <PulseTileLabel>{tile.label}</PulseTileLabel>
            <PulseTileBadge />
            <PulseTileValue>—</PulseTileValue>
            <PulseTileSub>{tile.sub}</PulseTileSub>
          </Link>
        ))}
      </div>

      {player && (
        <div className="mt-4 max-w-sm">
          <CheckInCard
            playerId={player.id}
            timezone={player.timezone}
            source="dashboard"
            title="Mindset Coach"
            description="Today's check-in."
          />
        </div>
      )}

      <Empty title="Nothing else to show yet">
        Agent status, the latest Match Scribe note and patron movement will appear here as each is
        connected.
      </Empty>
    </>
  );
}
