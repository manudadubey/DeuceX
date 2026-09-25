import { AlertTriangle, CircleAlert, Info } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  Progress,
  Stat,
  StatLabel,
  StatSub,
  StatValue,
  StatsRow,
  cn,
} from '@deucex/ui';
import { BarChart, Legend, LineChart } from '@/components/charts';
import { aud, dateTime, duration, percent } from '@/components/format';
import { Grid, LinkButton, PageHeader } from '@/components/page';
import type { Overview } from '@/lib/api';
import { requireArea, serverApi } from '@/lib/server-api';

const SEVERITY_ICON = { danger: CircleAlert, warn: AlertTriangle, info: Info } as const;

function longToday(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

// PRD-13 section 4.2.
export default async function OverviewPage() {
  const [me, o] = await Promise.all([
    requireArea('overview'),
    serverApi<Overview>('/admin/overview'),
  ]);
  const run = o.stats.morningRun;

  const runSentence =
    run.total === 0
      ? 'No scheduled agent runs have started today yet.'
      : `Scheduled runs today: ${run.total - run.failed} of ${run.total} completed${
          run.failed ? `, ${run.failed} failed and are retrying` : ''
        }${run.finishedAt ? `; the last finished at ${dateTime(run.finishedAt)}` : ''}.`;

  return (
    <>
      <PageHeader
        title={longToday(o.date)}
        description={runSentence}
        note={
          o.aggregatedAt
            ? `Agent health aggregated ${dateTime(o.aggregatedAt)} · next aggregation 02:00 UTC`
            : 'Agent health has not been aggregated yet; it runs nightly at 02:00 UTC.'
        }
        actions={
          me.areas.includes('agents') ? (
            <LinkButton href="/agents" variant="outline" size="sm">
              Agent health
            </LinkButton>
          ) : null
        }
      />

      <StatsRow>
        <Stat>
          <StatLabel title="Opened the app or captured a note in the last 7 days">
            Active players
          </StatLabel>
          <StatValue>
            {o.stats.active} <small>of {o.stats.signedUp} signed up</small>
          </StatValue>
          <StatSub>
            +{o.stats.newThisWeek} this week · {percent(o.stats.weeklyActiveShare)} weekly active
          </StatSub>
        </Stat>
        <Stat>
          <StatLabel>MRR</StatLabel>
          <StatValue>{o.stats.mrrAud === null ? 'Owner only' : aud(o.stats.mrrAud)}</StatValue>
          <StatSub>
            {o.stats.pro} Pro · {o.stats.elite} Elite paying
          </StatSub>
        </Stat>
        <Stat>
          <StatLabel>Trials in progress</StatLabel>
          <StatValue>{o.stats.trials}</StatValue>
          <StatSub>{o.stats.trialsEndingThisWeek} end this week</StatSub>
        </Stat>
        <Stat>
          <StatLabel>Scheduled runs today</StatLabel>
          <StatValue>
            {run.total - run.failed} <small>of {run.total}</small>
          </StatValue>
          <StatSub>
            {run.failed ? <span className="text-danger">{run.failed} failed</span> : 'None failed'}{' '}
            · median {duration(run.medianMs)}
          </StatSub>
        </Stat>
      </StatsRow>

      <Grid className="grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>
              Sorted by what it blocks: launch promises first, then money, then hygiene.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {o.attention.length === 0 ? (
              <Empty title="Nothing needs a person right now">
                Open cases, failing runs, stale feeds and money problems appear here first.
              </Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {o.attention.map((item) => {
                  const Icon = SEVERITY_ICON[item.severity];
                  return (
                    <li
                      key={item.title}
                      className="grid grid-cols-[2rem_1fr_auto] items-start gap-3 rounded-lg p-3 shadow-[0_0_0_1px_var(--border)]"
                    >
                      <span
                        className={cn(
                          'grid size-8 place-items-center rounded-md',
                          item.severity === 'danger' && 'bg-danger-bg text-danger',
                          item.severity === 'warn' && 'bg-warn-bg text-warn',
                          item.severity === 'info' && 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-medium">{item.title}</span>
                        <span className="block text-[0.8125rem] text-muted-foreground">
                          {item.body}
                        </span>
                      </span>
                      <LinkButton href={item.href} variant="outline" size="sm">
                        {item.cta}
                      </LinkButton>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approval rate by agent</CardTitle>
            <CardDescription>
              Share of proposals the player acted on within 48 hours, rolling seven days. Below 30
              percent for two weeks is a product alert.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {o.approvalRates.map((a) => (
              <div key={a.agent} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{a.label}</span>
                  <span className="flex items-center gap-2 font-mono text-xs">
                    {a.under ? <Badge variant="danger">Under 30%</Badge> : null}
                    {a.rate === null ? 'Not measured yet' : percent(a.rate)}
                  </span>
                </div>
                <Progress value={(a.rate ?? 0) * 100} />
              </div>
            ))}
          </CardContent>
          <CardFooter>
            <span className="text-xs text-muted-foreground">
              The 30 percent line is PRD-00 section 6&rsquo;s threshold.
            </span>
          </CardFooter>
        </Card>
      </Grid>

      <Grid>
        <Card>
          <CardHeader>
            <CardTitle>Sign-ups</CardTitle>
            <CardDescription>
              Weekly, last twelve weeks. Conversions join this chart once Stripe Billing is live.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              ariaLabel={`Weekly sign-ups for twelve weeks, ${o.signups.reduce((s, w) => s + w.signups, 0)} in total`}
              data={o.signups.map((w) => ({
                label: new Date(`${w.week}T00:00:00Z`).toLocaleDateString('en-AU', {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                }),
                value: w.signups,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Model spend per paying player</CardTitle>
            <CardDescription>
              Monthly model and API cost divided by paying players. The cap is 15 percent of the Pro
              price, {aud(o.spendCapAud, 2)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Legend
              items={[
                { label: 'Spend', color: 'var(--chart-2)' },
                { label: 'Cap', color: 'var(--destructive)', dashed: true },
              ]}
            />
            <LineChart
              ariaLabel={`Model spend per paying player for six months against the ${aud(o.spendCapAud, 2)} cap`}
              cap={o.spendCapAud}
              valueFormat={(v) => aud(v, 2)}
              data={o.spendPerPlayer.map((m) => ({
                label: new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-AU', {
                  month: 'short',
                  timeZone: 'UTC',
                }),
                value: m.perPlayerAud,
              }))}
            />
          </CardContent>
        </Card>
      </Grid>
    </>
  );
}
