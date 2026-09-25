import Link from 'next/link';
import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Item,
  ItemActions,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Progress,
} from '@deucex/ui';
import type { Player } from '@deucex/db';
import { showDoublesChip } from '@deucex/db';
import { CheckInCard } from '@/components/mindset/check-in-card';
import { RunwayPulseTile } from '@/components/financial/runway-pulse-tile';
import { DecisionTile } from '@/components/tournament/decision-tile';
import { DecisionCardSlot } from '@/components/tournament/decision-card-slot';
import { PatronsCard, PatronsPulseTile } from '@/components/fans/patrons-dashboard';
import { ContentAgentCard } from '@/components/content/dashboard-card';

const MINDSET_STARTS_AFTER_NOTES = 3;

// The prototype's `#/first-week` state (PRD-11 section 4.2), wired to real
// player data (build plan step 1.4). Runway and the Tournament Agent
// shortlist are both real now (steps 2.2 and 3.2), and so are the Patrons
// tile and card (step 4.1), which keep the first-week zero state until the
// patron page is live.
export function FirstWeekDashboard({
  player,
  notesCount,
  playerEmail,
  doublesRank = null,
}: {
  player: Player;
  notesCount: number;
  playerEmail: string;
  /** Latest ranking_snapshots.tour_doubles_rank (M-STG-4: shown when inside 500). */
  doublesRank?: number | null;
}) {
  const stageLabel =
    player.stage === '1' ? 'Building' : player.stage === '2' ? 'Emerging' : 'Established';
  const verified = player.verification === 'verified';
  const noteDone = notesCount > 0;
  const doneCount = 1 + (noteDone ? 1 : 0);
  const plan = player.tier === 'pro' || player.tier === 'elite' ? player.tier : 'free';

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
            <div className="flex items-baseline gap-3">
              <div className="font-mono text-4xl font-medium">
                <small className="mr-0.5 text-2xl text-muted-foreground">#</small>
                {player.tour_rank}
              </div>
              {showDoublesChip(doublesRank) && (
                <Badge variant="secondary">Doubles #{doublesRank}</Badge>
              )}
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
        <RunwayPulseTile
          playerId={player.id}
          homeCurrency={player.home_currency}
          weeklyBudget={player.weekly_budget}
        />
        <DecisionTile
          playerId={player.id}
          homeCurrency={player.home_currency}
          weeklyBudget={player.weekly_budget}
        />
        <PatronsPulseTile playerId={player.id} plan={plan} homeCurrency={player.home_currency} />
      </section>

      <DecisionCardSlot
        playerId={player.id}
        homeCurrency={player.home_currency}
        weeklyBudget={player.weekly_budget}
      />

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
        <ContentAgentCard playerId={player.id} isFree={plan === 'free'} />

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

        <PatronsCard playerId={player.id} plan={plan} homeCurrency={player.home_currency} />
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
