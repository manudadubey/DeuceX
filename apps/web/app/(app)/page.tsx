import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Empty, PulseTileBadge, PulseTileLabel, PulseTileSub, PulseTileValue } from '@deucex/ui';
import { getLatestRankingSnapshotForPlayer, listNotes } from '@deucex/db';
import { createClient } from '@/lib/supabase/server';
import { CheckInCard } from '@/components/mindset/check-in-card';
import { FirstWeekDashboard } from '@/components/dashboard/first-week-dashboard';

// The "three answers" dashboard (DEUCEX-CONTEXT.md 5.1), with honest empty states:
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

// Step 1.4 (First-week dashboard and onboarding): a player who has finished
// onboarding (a players row exists) lands on FirstWeekDashboard instead of
// this empty-shell view, which now only covers the "hasn't onboarded at
// all" case. dashboard_state only ever reaches 'first' in this build — the
// populated "full" state this falls through to needs the Tournament,
// Financial and Fans agents this step deliberately doesn't build (Phase 2
// to 4), so it keeps the same honest zero-state tiles step 0.5 shipped.
export default async function DashboardPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = typeof data?.claims.sub === 'string' ? data.claims.sub : undefined;
  const email = typeof data?.claims.email === 'string' ? data.claims.email : undefined;
  if (!playerId) redirect('/signin');

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .maybeSingle();

  if (player && player.dashboard_state === 'first') {
    // A wide, practically-unbounded window rather than a new "total notes"
    // query: the first-week checklist just needs to know whether any note
    // exists yet, and listNotes is already RLS-scoped and tested.
    const notes = await listNotes(supabase, { sinceDays: 3650 });
    // Step 3.1: the doubles chip (M-STG-4) reads the player's latest
    // ranking_snapshots row, not players.tour_rank — doubles rank has no
    // home on players itself, only on the weekly snapshot history.
    const latestSnapshot = await getLatestRankingSnapshotForPlayer(supabase, playerId);
    return (
      <FirstWeekDashboard
        player={player}
        notesCount={notes.length}
        playerEmail={email ?? ''}
        doublesRank={latestSnapshot?.tour_doubles_rank ?? null}
      />
    );
  }

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
