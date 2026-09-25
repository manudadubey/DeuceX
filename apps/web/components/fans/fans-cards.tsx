'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  BadgeDot,
  Button,
  Card,
  CardActions,
  CardDescription,
  CardHeader,
  CardTitle,
  Confirm,
  Empty,
  HelpMark,
  Stat,
  StatLabel,
  StatSub,
  StatValue,
  StatsRow,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from '@procircuit/ui';
import { formatPatronMoney } from '@procircuit/agents';
import { createClient } from '@/lib/supabase/client';
import { confirmApproval } from '@/lib/approvals/confirm-approval';
import { billingResumeNotice, pausedMembershipEndDate } from '@procircuit/shared';
import { inviteFromWaitlist, resumePatronBilling, startConnectOnboarding } from '@/lib/fans/api';
import type { FansSnapshot } from '@/lib/fans/load';
import { MovementChart, MrrChart } from './fans-charts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 24 * 60 * 60 * 1000;

function dayLabel(iso: string, withWeekday = false): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return `${withWeekday ? `${WEEKDAYS[d.getUTCDay()]} ` : ''}${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function nextFriday(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

function timeAgo(iso: string): string {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / (60 * 60 * 1000));
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// ---------------------------------------------------------------------------
// KPI row (P-15)
// ---------------------------------------------------------------------------

export function FansKpis({ snapshot }: { snapshot: FansSnapshot }) {
  const { kpi, tiers, homeCurrency, waitlist } = snapshot;
  const change = kpi.netChangeThisMonth;
  const payout = kpi.nextPayout;
  const estimate = kpi.payoutEstimate;
  const feePercent = Math.round((payout?.platformFeeRate ?? kpi.feeRate ?? 0.08) * 100);
  return (
    <StatsRow aria-label="Summary">
      <Stat>
        <StatLabel>Patrons</StatLabel>
        <StatValue>
          {kpi.full && kpi.cap ? (
            <>
              {kpi.active} of {kpi.cap} <small>· {waitlist.length} on the waitlist</small>
            </>
          ) : (
            <>
              {kpi.active}{' '}
              <small>
                {change >= 0 ? '+' : '−'}
                {Math.abs(change)} this month
              </small>
            </>
          )}
        </StatValue>
        <StatSub>
          {tiers.map((t) => `${t.name} ${t.activeCount}`).join(' · ') || 'No tiers published yet'}
        </StatSub>
      </Stat>
      <Stat>
        <StatLabel className="flex items-center gap-1">
          Kept over 12 months
          <HelpMark label="Share of patrons from a year ago who are still with you. The relationship number that matters more than MRR." />
        </StatLabel>
        <StatValue style={kpi.retentionPercent !== null ? { color: 'var(--ok)' } : undefined}>
          {kpi.retentionPercent !== null ? `${kpi.retentionPercent}%` : '–'}
        </StatValue>
        <StatSub>
          {kpi.leftInLast90Days === 1 ? '1 left' : `${kpi.leftInLast90Days} left`} in the last 90
          days
          {kpi.retentionPercent === null ? ' · shows once your page is a year old' : ''}
        </StatSub>
      </Stat>
      <Stat>
        <StatLabel>Average time with you</StatLabel>
        <StatValue>
          {kpi.averageTenureMonths !== null ? kpi.averageTenureMonths.toFixed(1) : '–'}{' '}
          <small>months</small>
        </StatValue>
        <StatSub>
          {kpi.longest
            ? `Longest: ${kpi.longest.name} · ${kpi.longest.months} months`
            : 'From your patron records'}
        </StatSub>
      </Stat>
      <Stat>
        <StatLabel>
          Next payout ·{' '}
          {payout ? dayLabel(payout.friday, true) : dayLabel(nextFriday(new Date()), true)}
        </StatLabel>
        <StatValue>
          {payout
            ? formatPatronMoney(payout.net, payout.currency)
            : estimate
              ? formatPatronMoney(estimate.net, homeCurrency)
              : '–'}
        </StatValue>
        <StatSub>
          {payout
            ? `${formatPatronMoney(payout.gross, payout.currency)} gross · ${feePercent}% fee · Stripe Connect`
            : estimate
              ? `Estimate · ${formatPatronMoney(estimate.gross, homeCurrency)} gross · ${feePercent}% fee · Stripe Connect`
              : 'Nothing scheduled yet'}
        </StatSub>
      </Stat>
    </StatsRow>
  );
}

// ---------------------------------------------------------------------------
// Last 30 days (P-6)
// ---------------------------------------------------------------------------

export function MovementCard({ snapshot }: { snapshot: FansSnapshot }) {
  const feed = snapshot.events.filter((e) => e.kind !== 'card_recovered').slice(0, 6);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Last 30 days</CardTitle>
        <CardDescription>
          Joins and departures as people, not numbers. Dashed lines are the updates you published.
        </CardDescription>
        <CardActions className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <i className="block size-2 rounded-sm" style={{ background: 'var(--chart-2)' }} />
            Joined
          </span>
          <span className="flex items-center gap-1">
            <i className="block size-2 rounded-sm" style={{ background: 'var(--danger)' }} />
            Left
          </span>
        </CardActions>
      </CardHeader>
      <div className="px-5 max-sm:px-4">
        <MovementChart
          days={snapshot.chart.days}
          joined={snapshot.chart.joined}
          left={snapshot.chart.left}
        />
      </div>
      {feed.length === 0 ? (
        <Empty title="No movement yet">
          Joins, upgrades and departures appear here as Stripe reports them.
        </Empty>
      ) : (
        <div className="grid pb-2">
          {feed.map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[auto_1fr_auto] gap-3 border-t border-border px-5 py-2.5 text-sm max-sm:px-4"
            >
              <i
                className="mt-1.5 block size-2 rounded-full"
                style={{
                  background:
                    e.kind === 'leave' || e.kind === 'card_failed'
                      ? 'var(--danger)'
                      : 'var(--chart-2)',
                }}
              />
              <div>
                {e.title}
                {e.attribution ? (
                  <div className="text-xs text-muted-foreground">{e.attribution}</div>
                ) : null}
              </div>
              <div className="font-mono text-xs text-muted-foreground">{dayLabel(e.at, true)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Payouts (P-12, P-13) with the Stripe connection row
// ---------------------------------------------------------------------------

function useOnboard(playerId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const approval = await confirmApproval({
        playerId,
        actionType: 'connect_onboard',
        payload: {},
      });
      const { url } = await startConnectOnboarding(supabase, approval.id);
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stripe could not be reached.');
      setBusy(false);
    }
  };
  return { busy, error, go };
}

const ONBOARD_CONSEQUENCE =
  "Opens Stripe's own onboarding. ProCircuit creates a Stripe Express account in your name and sends Stripe your name and email; Stripe asks for your identity and bank details itself, which takes about ten minutes. You can stop at any point.";

export function PayoutsCard({ snapshot, playerId }: { snapshot: FansSnapshot; playerId: string }) {
  const { programme, payouts, kpi } = snapshot;
  const onboard = useOnboard(playerId);
  const [confirming, setConfirming] = useState(false);
  const feePercent = Math.round((kpi.feeRate ?? 0.08) * 100);
  const kyc = programme?.kycStatus ?? 'not_started';
  const held =
    kyc === 'action_required' || (kyc === 'complete' && programme?.payoutsEnabled === false);
  const stale =
    programme?.stripeSyncedAt &&
    Date.now() - new Date(programme.stripeSyncedAt).getTime() > 8 * DAY_MS
      ? programme.stripeSyncedAt
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payouts</CardTitle>
        <CardDescription>Weekly, every Friday, through Stripe Connect.</CardDescription>
      </CardHeader>
      <div className="mx-5 mb-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-lg bg-surface p-3.5 max-sm:mx-4">
        <svg
          className="row-span-2 size-5 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
        <div className="text-sm font-medium">
          {kyc === 'complete'
            ? 'Stripe Connect Express · verified'
            : held
              ? 'Action required in Stripe'
              : 'Stripe onboarding not finished'}
        </div>
        {kyc === 'complete' && !held ? (
          <Badge variant="ok" className="row-span-2">
            <BadgeDot />
            Active
          </Badge>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="row-span-2"
            disabled={onboard.busy}
            onClick={() => setConfirming(true)}
          >
            Continue in Stripe
          </Button>
        )}
        <div className="text-xs text-muted-foreground">
          {kyc === 'complete' && !held
            ? `${programme?.bankLast4 ? `Bank ending ${programme.bankLast4}` : 'Your bank account'} is held by Stripe, not ProCircuit. Change it in the Stripe dashboard.`
            : held
              ? 'Stripe needs something from you before it pays out. Payouts show Held until it is done.'
              : 'Patrons can sign up once Stripe has verified you.'}
          {stale ? ` Stripe · not refreshed since ${timeAgo(stale)}.` : ''}
        </div>
      </div>
      {confirming ? (
        <div className="mx-5 mb-3 max-sm:mx-4">
          <Confirm
            title="Continue in Stripe"
            description={ONBOARD_CONSEQUENCE}
            actions={
              <>
                <Button size="sm" disabled={onboard.busy} onClick={onboard.go}>
                  {onboard.busy ? 'Opening…' : 'Continue'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            }
          />
          {onboard.error ? <p className="mt-1 text-xs text-danger">{onboard.error}</p> : null}
        </div>
      ) : null}
      <TableWrap>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Friday</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Fee {feePercent}%</TableHead>
              <TableHead className="text-right">Stripe</TableHead>
              <TableHead className="text-right">Paid to you</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No payouts yet. Stripe pays out every Friday once patrons have been charged.
                </TableCell>
              </TableRow>
            ) : (
              payouts.map((p) => {
                const status = held && p.status === 'scheduled' ? 'held' : p.status;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap font-mono text-[0.8125rem]">
                      {dayLabel(p.friday)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatPatronMoney(p.gross, p.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      −{formatPatronMoney(p.platformFee, p.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      −{formatPatronMoney(p.stripeFee, p.currency)}
                    </TableCell>
                    <TableCell
                      className="text-right font-mono"
                      style={status === 'paid' ? { color: 'var(--ok)' } : undefined}
                    >
                      {formatPatronMoney(p.net, p.currency)}
                    </TableCell>
                    <TableCell>
                      {status === 'paid' ? (
                        <Badge
                          variant="ok"
                          title="Paid. A payout that has been sent can't be reversed."
                        >
                          Paid
                        </Badge>
                      ) : status === 'scheduled' ? (
                        <Badge variant="warn">Scheduled</Badge>
                      ) : status === 'held' ? (
                        <Badge variant="secondary">Held</Badge>
                      ) : (
                        <Badge variant="danger">Failed</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={6} className="font-normal text-[0.8125rem] text-muted-foreground">
                The platform fee is {feePercent}% of what patrons pay
                {feePercent === 8 ? ' (5% on Elite)' : ''}, taken on the gross. Stripe&apos;s 1.75%
                + 30c per charge is shown separately.
                <span className="block">
                  Payouts appear in the Financial Agent as patron income.
                </span>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </TableWrap>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// MRR (P-16), drawn last on purpose
// ---------------------------------------------------------------------------

export function MrrCard({ snapshot }: { snapshot: FansSnapshot }) {
  const { mrr, homeCurrency } = snapshot;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly recurring revenue</CardTitle>
        <CardDescription>Shown last on purpose. Six months, gross, before fees.</CardDescription>
        <CardActions>
          <Badge variant="secondary" className="font-mono">
            {formatPatronMoney(mrr.current, homeCurrency)}
            {mrr.change !== null
              ? ` · ${mrr.change >= 0 ? '+' : '−'}${Math.abs(Math.round(mrr.change * 100))}% mo/mo`
              : ''}
          </Badge>
        </CardActions>
      </CardHeader>
      <div className="px-5 pb-4 max-sm:px-4">
        <MrrChart history={mrr.history} currency={homeCurrency} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Waitlist (P-4): the player confirms each invitation (owner decision, step 4.1)
// ---------------------------------------------------------------------------

export function WaitlistCard({
  snapshot,
  playerId,
  onChanged,
  onToast,
}: {
  snapshot: FansSnapshot;
  playerId: string;
  onChanged: () => void;
  onToast: (title: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = snapshot.waitlist[0];
  if (!next) return null;
  const placeOpen = !snapshot.kpi.full;

  const invite = async () => {
    setBusy(true);
    setError(null);
    try {
      const approval = await confirmApproval({
        playerId,
        actionType: 'waitlist_invite',
        payload: { entryId: next.id },
      });
      await inviteFromWaitlist(supabase, next.id, approval.id);
      onToast(`Invitation sent to ${next.email}`);
      setConfirming(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The invitation was not sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Waitlist</CardTitle>
        <CardDescription>
          {snapshot.waitlist.length === 1 ? '1 person' : `${snapshot.waitlist.length} people`} asked
          to be first in when a place opens. Invite them in order.
        </CardDescription>
      </CardHeader>
      <div className="px-5 pb-5 max-sm:px-4">
        {confirming ? (
          <Confirm
            title={`Invite ${next.email}`}
            description={`Sends one email now from your name to ${next.email} with a link to your patron page. Places aren't held, so the first person through checkout gets it. It can't be recalled once sent.`}
            actions={
              <>
                <Button size="sm" disabled={busy} onClick={invite}>
                  {busy ? 'Sending…' : 'Send invitation'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            }
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="mr-auto">
              Next: {next.email}{' '}
              <span className="text-muted-foreground">· since {dayLabel(next.joinedAt)}</span>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={!placeOpen}
              onClick={() => setConfirming(true)}
            >
              Invite next
            </Button>
          </div>
        )}
        {!placeOpen ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Your page is full. Invite once a place opens, or move to Elite for no limit.
          </p>
        ) : null}
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// First run: no programme yet, or Stripe not finished (PRD-04 section 4.4)
// ---------------------------------------------------------------------------

export function SetupCard({ snapshot, playerId }: { snapshot: FansSnapshot; playerId: string }) {
  const onboard = useOnboard(playerId);
  const [confirming, setConfirming] = useState(false);
  const started = snapshot.programme !== null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{started ? 'Finish setting up payouts' : 'Switch on patron tiers'}</CardTitle>
        <CardDescription>
          Most players get their first patron from people who already know them. Stripe Connect
          handles payments and payouts; ProCircuit never sees a card or bank number. KYC takes about
          ten minutes.
        </CardDescription>
      </CardHeader>
      <ol className="grid gap-2 px-5 pb-4 text-sm max-sm:px-4">
        <li>
          <span className="font-medium">1. Verify with Stripe.</span>{' '}
          <span className="text-muted-foreground">
            Your identity and the bank account payouts go to, entered on Stripe&apos;s own pages.
          </span>
        </li>
        <li>
          <span className="font-medium">2. Publish your tiers.</span>{' '}
          <span className="text-muted-foreground">
            Three by default, priced in your home currency. Edit any of them.
          </span>
        </li>
        <li>
          <span className="font-medium">3. Share your page.</span>{' '}
          <span className="text-muted-foreground">
            Patrons sign up on it through Stripe Checkout.
          </span>
        </li>
      </ol>
      <div className="px-5 pb-5 max-sm:px-4">
        {confirming ? (
          <Confirm
            title={started ? 'Continue in Stripe' : 'Set up payouts with Stripe'}
            description={ONBOARD_CONSEQUENCE}
            actions={
              <>
                <Button size="sm" disabled={onboard.busy} onClick={onboard.go}>
                  {onboard.busy ? 'Opening…' : 'Continue'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            }
          />
        ) : (
          <Button onClick={() => setConfirming(true)}>
            {started ? 'Continue in Stripe' : 'Set up payouts with Stripe'}
          </Button>
        )}
        {onboard.error ? <p className="mt-2 text-xs text-danger">{onboard.error}</p> : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 4.1b · P-18: resume patron billing after a return to Pro or Elite
// ---------------------------------------------------------------------------

export function PausedBillingCard({
  snapshot,
  playerId,
  playerName,
  onChanged,
  onToast,
}: {
  snapshot: FansSnapshot;
  playerId: string;
  playerName: string;
  onChanged: () => void;
  onToast: (title: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pausedPatrons = snapshot.patrons.filter((p) => p.status === 'paused');
  const paused = pausedPatrons.length;
  // The earliest pause ends first; that's the date worth naming.
  const firstPausedAt = pausedPatrons
    .map((p) => p.pausedAt)
    .filter((d): d is string => d !== null)
    .sort()[0];
  if (paused === 0 || snapshot.plan === 'free') return null;
  const who = paused === 1 ? '1 patron' : `${paused} patrons`;
  const notice = billingResumeNotice({ playerName });

  const resume = async () => {
    setBusy(true);
    setError(null);
    try {
      const approval = await confirmApproval({
        playerId,
        actionType: 'patron_billing_resume',
        payload: {},
      });
      const result = await resumePatronBilling(supabase, approval.id);
      if (result.failed.length > 0) {
        setError(
          `Stripe couldn't resume ${result.failed.length === 1 ? '1 patron' : `${result.failed.length} patrons`}; they stay paused. Try again in a moment.`,
        );
      } else {
        onToast(
          `Billing resumed for ${who}${result.unnotified.length > 0 ? ` · ${result.unnotified.length} didn't get the email` : ''}`,
        );
        setConfirming(false);
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Billing was not resumed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patron billing is paused</CardTitle>
        <CardDescription>
          {who} paused when you moved to Free. Nothing is being charged. They can come back without
          signing up again
          {firstPausedAt
            ? ` if you resume by ${pausedMembershipEndDate(new Date(firstPausedAt))}; a membership paused for 90 days ends`
            : ''}
          .
        </CardDescription>
      </CardHeader>
      <div className="px-5 pb-5 max-sm:px-4">
        {confirming ? (
          <Confirm
            title={`Resume billing for ${who}`}
            description={
              <>
                Restarts each membership at the price that patron had before, from their next
                billing date, and sends each this email from you now. It can be paused again from
                Settings.
                <span className="mt-2 block rounded-md border border-border p-2 text-xs">
                  <span className="block font-medium">{notice.subject}</span>
                  {notice.paragraphs.map((p) => (
                    <span key={p} className="mt-1 block">
                      {p}
                    </span>
                  ))}
                </span>
              </>
            }
            actions={
              <>
                <Button size="sm" disabled={busy} onClick={resume}>
                  {busy ? 'Resuming…' : 'Resume billing'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            }
          />
        ) : (
          <Button size="sm" onClick={() => setConfirming(true)}>
            Resume patron billing
          </Button>
        )}
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </div>
    </Card>
  );
}
