import Link from 'next/link';
import { Badge, Card, CardDescription, CardHeader, CardTitle, CardActions, cn } from '@deucex/ui';
import type { Player, RankingSnapshot } from '@deucex/db';
import { RunwayPulseTile } from '@/components/financial/runway-pulse-tile';
import { DecisionTile } from '@/components/tournament/decision-tile';
import { DecisionCardSlot } from '@/components/tournament/decision-card-slot';
import { PatronsCard, PatronsPulseTile } from '@/components/fans/patrons-dashboard';
import { ContentAgentCard } from '@/components/content/dashboard-card';
import { MindsetCard } from './mindset-card';
import { RankingHero } from './ranking-hero';
import type { RankChartDefence } from './rank-chart';

interface Step {
  title: string;
  sub: string;
  href: string | null;
  done: boolean;
  action: string;
}

// The prototype's dashboard (docs/deucex-dashboard.html, `#/` and its
// `#/first-week` state, PRD-11 section 4.2) wired to real player data: the
// ranking band, the three answers, this week's decision, the first-week
// checklist until its four steps are done ("This checklist disappears once
// the four are done"), then the three agent cards.
export function FirstWeekDashboard({
  player,
  notesCount,
  playerEmail,
  snapshots,
  defences,
  balanceEntered,
  pageLive,
  today,
}: {
  player: Player;
  notesCount: number;
  playerEmail: string;
  snapshots: RankingSnapshot[];
  defences: RankChartDefence[];
  /** A reserve_entries row exists: step 3. */
  balanceEntered: boolean;
  /** KYC complete and a tier published: step 4. */
  pageLive: boolean;
  today: Date;
}) {
  const verified = player.verification === 'verified';
  const plan = player.tier === 'pro' || player.tier === 'elite' ? player.tier : 'free';

  const steps: Step[] = [
    {
      title: verified ? 'Ranking verified and Tournament Agent scheduled' : 'Verify your ranking',
      sub: verified
        ? 'Done in setup · first run Sunday 20:00 UTC'
        : 'The Tournament Agent needs a verified ranking to build your shortlist.',
      href: verified ? null : '/onboarding',
      done: verified,
      action: '2 min',
    },
    {
      title: 'Record your first Match Scribe note',
      sub: 'After today’s practice is fine. The Content Agent drafts from it within 30 minutes; the Mindset Coach starts after your third.',
      href: '/match-scribe',
      done: notesCount > 0,
      action: 'Record',
    },
    {
      title: 'Enter today’s balance',
      sub: 'One number. Runway, the P&L and receipt scanning switch on.',
      href: '/agent/financial',
      done: balanceEntered,
      action: '1 min',
    },
    {
      title: 'Build your public page and switch on patron tiers',
      sub: 'Headline, bio, photo, three tiers. Stripe Connect handles payouts; KYC takes about ten minutes.',
      href: '/fans',
      done: pageLive,
      action: '10 min',
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nowIndex = steps.findIndex((s) => !s.done);

  return (
    <>
      <RankingHero player={player} snapshots={snapshots} defences={defences} today={today} />

      <section
        aria-label="Pulse"
        className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-1 max-[900px]:gap-3"
      >
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

      {doneCount < steps.length ? (
        <Card id="fwNext">
          <CardHeader>
            <CardTitle>Your first week</CardTitle>
            <CardDescription>
              Four things, in order. The agents start working as each one lands.
            </CardDescription>
            <CardActions>
              <Badge variant="secondary" className="tabular-nums">
                {doneCount} of 4 done
              </Badge>
            </CardActions>
          </CardHeader>
          <ol className="flex flex-col gap-1.5 px-6 max-sm:px-5">
            {steps.map((step, i) => {
              const now = i === nowIndex;
              const body = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'row-span-2 grid size-7 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground',
                      step.done && 'bg-chart-2 text-[oklch(0.2_0.05_131)]',
                      now && 'bg-foreground text-background',
                    )}
                  >
                    {step.done ? '✓' : i + 1}
                  </span>
                  <span className="text-sm font-medium">{step.title}</span>
                  <span className="col-start-2 text-xs text-muted-foreground">{step.sub}</span>
                  <span className="col-start-3 row-span-2 row-start-1">
                    <Badge variant={step.done ? 'ok' : now ? 'lime' : 'secondary'}>
                      {step.done ? 'Done' : step.action}
                    </Badge>
                  </span>
                </>
              );
              const rowClass =
                'grid grid-cols-[1.75rem_1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-lg bg-secondary/50 px-3 py-2.5 text-left no-underline text-foreground';
              return (
                <li key={step.title}>
                  {step.href && !step.done ? (
                    <Link
                      href={step.href}
                      className={cn(rowClass, 'transition-colors hover:bg-secondary')}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className={rowClass}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="border-t border-border px-6 pt-6 text-[0.8125rem] text-muted-foreground max-sm:px-5">
            This checklist disappears once the four are done.
          </p>
        </Card>
      ) : null}

      <section className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-1">
        <ContentAgentCard
          playerId={player.id}
          isFree={plan === 'free'}
          timezone={player.timezone}
        />
        <MindsetCard playerId={player.id} timezone={player.timezone} notesCount={notesCount} />
        <PatronsCard playerId={player.id} plan={plan} homeCurrency={player.home_currency} />
      </section>

      <span className="sr-only">Signed in as {playerEmail}</span>
    </>
  );
}
