import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Empty, PulseTileBadge, PulseTileLabel, PulseTileSub, PulseTileValue } from '@deucex/ui';
import { listNotes, listRankingSnapshotsForPlayer, pointsToDefend } from '@deucex/db';
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

  // dashboard_state only ever reaches 'first' in this build; the checklist
  // inside hides itself once its four steps are done, which is all the
  // prototype's full state changes (PRD-11 section 4.2).
  if (player && player.dashboard_state === 'first') {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const yearAgo = new Date(today.getTime() - 52 * 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    // A wide, practically-unbounded window rather than a new "total notes"
    // query: the checklist just needs to know whether any note exists, and
    // the Mindset card whether three do.
    const [notes, snapshots, reserve, programme, tiers] = await Promise.all([
      listNotes(supabase, { sinceDays: 3650 }),
      listRankingSnapshotsForPlayer(supabase, playerId, yearAgo),
      supabase.from('reserve_entries').select('id').eq('player_id', playerId).limit(1),
      supabase
        .from('patron_programmes')
        .select('kyc_status')
        .eq('player_id', playerId)
        .maybeSingle(),
      supabase
        .from('patron_tiers')
        .select('id')
        .eq('player_id', playerId)
        .not('stripe_price_id', 'is', null)
        .limit(1),
    ]);

    // Points-defence markers: singles points dropping off in the next eight
    // weeks, named from the tournaments table where the id resolves.
    const latest = snapshots[snapshots.length - 1] ?? null;
    const expiring = pointsToDefend(latest, todayIso, 8);
    const names = new Map<string, string>();
    if (expiring.length > 0) {
      const { data } = await supabase
        .from('tournaments')
        .select('id, city, name')
        .in(
          'id',
          expiring.map((e) => e.tournamentId),
        );
      for (const t of data ?? []) names.set(t.id, t.city ?? t.name);
    }

    return (
      <FirstWeekDashboard
        player={player}
        notesCount={notes.length}
        playerEmail={email ?? ''}
        snapshots={snapshots}
        defences={expiring.map((e) => ({
          week: e.expiryWeek,
          points: e.points,
          label: names.get(e.tournamentId) ?? null,
        }))}
        balanceEntered={(reserve.data?.length ?? 0) > 0}
        pageLive={programme.data?.kyc_status === 'complete' && (tiers.data?.length ?? 0) > 0}
        today={today}
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
            <PulseTileValue>–</PulseTileValue>
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
