import Link from 'next/link';
import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  Item,
  ItemActions,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Progress,
  PulseTileBadge,
  PulseTileLabel,
  PulseTileSub,
  PulseTileValue,
} from '@procircuit/ui';
import type { Player } from '@procircuit/db';
import { CheckInCard } from '@/components/mindset/check-in-card';

const MINDSET_STARTS_AFTER_NOTES = 3;

// The prototype's `#/first-week` state (PRD-11 section 4.2), wired to real
// player data (build plan step 1.4). Runway, Tournament Agent shortlists and
// Fans/patrons have nothing real to show yet in this build (those agents
// arrive in Phase 2 to 4), so those tiles keep the same honest zero-states
// dashboard page.tsx already used pre-onboarding — this only replaces the
// "not onboarded yet" banner with a real, personalised first week.
export function FirstWeekDashboard({
  player,
  notesCount,
  playerEmail,
}: {
  player: Player;
  notesCount: number;
  playerEmail: string;
}) {
  const stageLabel =
    player.stage === '1' ? 'Building' : player.stage === '2' ? 'Emerging' : 'Established';
  const verified = player.verification === 'verified';
  const noteDone = notesCount > 0;
  const doneCount = 1 + (noteDone ? 1 : 0);

  return (
    <>
      <Card id="fwRanking" className="p-6">
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">
            {player.tour.toUpperCase()} singles ranking{' '}
            <Badge variant="secondary">
              Stage {player.stage ?? '1'} · {stageLabel}
            </Badge>
          </div>
          {verified ? (
            <div className="font-mono text-4xl font-medium">
              <small className="mr-0.5 text-2xl text-muted-foreground">#</small>
              {player.tour_rank}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Unverified</Badge>
              <Link href="/onboarding" className="text-sm font-medium text-foreground underline">
                Verify your ranking
              </Link>
            </div>
          )}
        </div>
      </Card>

      <section aria-label="Pulse" className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-1">
        <Link
          href="/agent/financial"
          className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-card p-5 text-left text-card-foreground no-underline shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.05)] transition-shadow hover:shadow-[0_0_0_1px_var(--ring),0_1px_2px_rgba(0,0,0,.05)] max-sm:p-4"
        >
          <PulseTileLabel>Runway</PulseTileLabel>
          <PulseTileBadge>
            <Badge variant="secondary">Not set up</Badge>
          </PulseTileBadge>
          <PulseTileValue className="text-muted-foreground">
            – <small>weeks</small>
          </PulseTileValue>
          <PulseTileSub>
            Enter today&apos;s cash balance and the Financial Agent runs tomorrow at 07:00.
          </PulseTileSub>
        </Link>
        <Link
          href="/agent/tournament"
          className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-card p-5 text-left text-card-foreground no-underline shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.05)] transition-shadow hover:shadow-[0_0_0_1px_var(--ring),0_1px_2px_rgba(0,0,0,.05)] max-sm:p-4"
        >
          <PulseTileLabel>Decision required</PulseTileLabel>
          <PulseTileBadge>
            <Badge variant="ok">Nothing due</Badge>
          </PulseTileBadge>
          <PulseTileValue>
            Sun <small>20:00 UTC</small>
          </PulseTileValue>
          <PulseTileSub>Your first shortlist arrives then.</PulseTileSub>
        </Link>
        <Link
          href="/profile"
          className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-card p-5 text-left text-card-foreground no-underline shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.05)] transition-shadow hover:shadow-[0_0_0_1px_var(--ring),0_1px_2px_rgba(0,0,0,.05)] max-sm:p-4"
        >
          <PulseTileLabel>Patrons</PulseTileLabel>
          <PulseTileBadge>
            <Badge variant="secondary">Page not live</Badge>
          </PulseTileBadge>
          <PulseTileValue className="text-muted-foreground">
            0 <small>patrons</small>
          </PulseTileValue>
          <PulseTileSub>Build your public page and switch on the tiers.</PulseTileSub>
        </Link>
      </section>

      <Card id="fwNext">
        <CardHeader>
          <CardTitle>Your first week</CardTitle>
          <CardDescription>
            Four things, in order. The agents start working as each one lands.
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-2 px-6">
          <Item>
            <ItemMedia>✓</ItemMedia>
            <ItemTitle>Ranking verified and Tournament Agent scheduled</ItemTitle>
            <ItemDescription>Done in setup · first run Sunday 20:00 UTC</ItemDescription>
            <ItemActions>
              <Badge variant="ok">Done</Badge>
            </ItemActions>
          </Item>
          <Link href="/match-scribe" className="no-underline">
            <Item className={noteDone ? '' : 'bg-sidebar-accent'}>
              <ItemMedia>{noteDone ? '✓' : '2'}</ItemMedia>
              <ItemTitle>Record your first Match Scribe note</ItemTitle>
              <ItemDescription>
                The Content Agent drafts from it within 30 minutes; the Mindset Coach starts after
                your third.
              </ItemDescription>
              <ItemActions>
                <Badge variant={noteDone ? 'ok' : 'lime'}>{noteDone ? 'Done' : 'Record'}</Badge>
              </ItemActions>
            </Item>
          </Link>
          <Link href="/agent/financial" className="no-underline">
            <Item>
              <ItemMedia>3</ItemMedia>
              <ItemTitle>Enter today&apos;s balance</ItemTitle>
              <ItemDescription>One number. Runway and receipt scanning switch on.</ItemDescription>
              <ItemActions>
                <Badge variant="secondary">1 min</Badge>
              </ItemActions>
            </Item>
          </Link>
          <Link href="/profile" className="no-underline">
            <Item>
              <ItemMedia>4</ItemMedia>
              <ItemTitle>Build your public page and switch on patron tiers</ItemTitle>
              <ItemDescription>Headline, bio, photo, three tiers.</ItemDescription>
              <ItemActions>
                <Badge variant="secondary">10 min</Badge>
              </ItemActions>
            </Item>
          </Link>
        </div>
        <p className="px-6 pt-2 text-[0.8125rem] text-muted-foreground">
          {doneCount} of 4 done · this checklist disappears once all four are.
        </p>
      </Card>

      <section className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Content Agent</CardTitle>
            <CardDescription>Waiting for your first note</CardDescription>
          </CardHeader>
          <Empty title="Nothing to draft yet">Sixty seconds after a match is all it needs.</Empty>
        </Card>

        <CheckInCard
          playerId={player.id}
          timezone={player.timezone}
          source="dashboard"
          title="Mindset Coach"
          description={
            notesCount >= MINDSET_STARTS_AFTER_NOTES
              ? "Today's check-in."
              : `${Math.min(notesCount, MINDSET_STARTS_AFTER_NOTES)} of ${MINDSET_STARTS_AFTER_NOTES} notes · until then, the daily check-in is enough.`
          }
        />

        <Card id="fwPatron">
          <CardHeader>
            <CardTitle>Patrons</CardTitle>
            <CardDescription>Page not live</CardDescription>
          </CardHeader>
          <Empty title="No patrons yet">Build your page and switch on the tiers.</Empty>
        </Card>
      </section>

      {notesCount < MINDSET_STARTS_AFTER_NOTES && (
        <div className="max-w-sm">
          <Progress value={(notesCount / MINDSET_STARTS_AFTER_NOTES) * 100} />
        </div>
      )}

      <span className="sr-only">Signed in as {playerEmail}</span>
    </>
  );
}
