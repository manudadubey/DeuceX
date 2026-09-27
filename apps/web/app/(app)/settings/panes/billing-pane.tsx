'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Confirm,
  Empty,
  ToggleGroup,
  ToggleGroupItem,
} from '@deucex/ui';
import { PatronPayoutsItem } from '@/components/fans/patron-settings';
import { StartTrialButton } from '@/components/billing/start-trial-button';
import { downgradeToFree, type Player } from '@deucex/db';
import type { Database } from '@deucex/db';
import {
  ANNUAL_SAVING_LABEL,
  billingPauseNotice,
  isBillingCycle,
  isPaidPlan,
  pausedMembershipEndDate,
  planPriceLine,
  type BillingCycle,
  type PaidPlan,
} from '@deucex/shared';
import { createClient } from '@/lib/supabase/client';
import { confirmApproval } from '@/lib/approvals/confirm-approval';
import { pausePatronBilling } from '@/lib/fans/api';
import { cancelPaidPlan, completeCheckout, startCheckout } from '@/lib/billing/api';
import { approximateHomeAmount } from '@/lib/billing/approx';

type Subscription = Database['public']['Tables']['billing_subscriptions']['Row'];

const LIVE = ['trialing', 'active', 'past_due', 'unpaid'];

function planName(plan: string | null | undefined): string {
  if (plan === 'pro') return 'Pro';
  if (plan === 'elite') return 'Elite';
  return 'Free';
}

function dayMonth(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
}

/** PRD-12 ST-7: plan, price and where it stands, in one line. */
function planLine(player: Player, sub: Subscription | null): string {
  const tier = player.tier ?? 'free';
  if (!isPaidPlan(tier)) return 'Free';
  const cycle: BillingCycle = isBillingCycle(player.billing_cycle)
    ? player.billing_cycle
    : 'monthly';
  const parts = [planName(tier), planPriceLine(tier, cycle)];
  const live = sub && LIVE.includes(sub.status) ? sub : null;
  if (player.tier_status === 'comped') {
    parts.push(`complimentary${player.comp_until ? ` until ${dayMonth(player.comp_until)}` : ''}`);
  } else if (live?.cancel_at_period_end) {
    parts.push(`ends ${dayMonth(live.current_period_end)}`);
  } else if (live?.status === 'trialing') {
    parts.push(`card on file, first charge ${dayMonth(live.trial_end)}`);
  } else if (live?.status === 'past_due' || live?.status === 'unpaid') {
    parts.push('payment due');
  } else if (live) {
    parts.push(`renews ${dayMonth(live.current_period_end)}`);
  } else if (player.tier_status === 'trialing') {
    parts.push(`trial ends ${dayMonth(player.trial_ends_at)}`);
  }
  return parts.join(' · ');
}

// PRD-12 §4.4, ST-7/ST-8, and docs/BILLING-DECISIONS.md. Plans are billed in
// USD by Stripe; the card never touches DeuceX. Adding a card and ending a
// paid plan are gated (subscription_checkout, subscription_cancel); a
// card-less trial drops to Free through downgrade_to_free.
export function BillingPane({
  player,
  onPlayerChange,
  onToast,
  checkoutSessionId,
}: {
  player: Player;
  onPlayerChange: (patch: Partial<Player>) => void;
  onToast: (title: string) => void;
  /** Set on the return from Stripe Checkout (?checkout=). */
  checkoutSessionId?: string | null | undefined;
}) {
  const router = useRouter();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [downgrading, setDowngrading] = useState(false);
  const [payingPatrons, setPayingPatrons] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlan>(
    isPaidPlan(player.tier) ? player.tier : 'pro',
  );
  const [checkoutCycle, setCheckoutCycle] = useState<BillingCycle>(
    isBillingCycle(player.billing_cycle) ? player.billing_cycle : 'monthly',
  );
  const [confirmingCheckout, setConfirmingCheckout] = useState(false);
  const [openingCheckout, setOpeningCheckout] = useState(false);
  const [approx, setApprox] = useState<string | null>(null);
  const completed = useRef(false);

  const plan = player.tier ?? 'free';
  const live = sub && LIVE.includes(sub.status) ? sub : null;
  const comped = player.tier_status === 'comped';
  const trialUnused = !player.trial_started_at && (player.tier_status ?? 'free') === 'free';
  const inTrial = player.tier_status === 'trialing' && !live;
  const notice = billingPauseNotice({
    playerName: player.name,
    endsOn: pausedMembershipEndDate(new Date()),
  });

  const loadSubscription = useCallback(async () => {
    const { data } = await createClient()
      .from('billing_subscriptions')
      .select('*')
      .eq('player_id', player.id)
      .maybeSingle();
    setSub(data ?? null);
  }, [player.id]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  // Back from Stripe Checkout: record what happened there, once.
  useEffect(() => {
    if (!checkoutSessionId || completed.current) return;
    completed.current = true;
    void (async () => {
      try {
        const result = await completeCheckout(createClient(), checkoutSessionId);
        if (result.state === 'complete') {
          onPlayerChange({
            tier: result.plan,
            tier_status: result.tierStatus,
            billing_cycle: result.cycle,
          });
          onToast(
            result.firstChargeAt
              ? `Card added · first charge ${dayMonth(result.firstChargeAt)}`
              : `You're on ${planName(result.plan)}`,
          );
          await loadSubscription();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn't confirm the checkout.");
      } finally {
        router.replace('/settings?pane=billing');
      }
    })();
  }, [checkoutSessionId, loadSubscription, onPlayerChange, onToast, router]);

  // Decision 5: an approximate home-currency figure beside the USD price.
  useEffect(() => {
    let cancelled = false;
    void approximateHomeAmount(createClient(), {
      plan: checkoutPlan,
      cycle: checkoutCycle,
      homeCurrency: player.home_currency,
    }).then((text) => {
      if (!cancelled) setApprox(text);
    });
    return () => {
      cancelled = true;
    };
  }, [checkoutPlan, checkoutCycle, player.home_currency]);

  // Step 4.1b · P-18: how many patrons a downgrade would stop charging.
  useEffect(() => {
    if (!confirming) return;
    void createClient()
      .from('patrons')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', player.id)
      .in('status', ['active', 'past_due'])
      .then(({ count }) => setPayingPatrons(count ?? 0));
  }, [confirming, player.id]);

  async function handleCheckout() {
    setOpeningCheckout(true);
    setError(null);
    try {
      const approval = await confirmApproval({
        playerId: player.id,
        actionType: 'subscription_checkout',
        payload: { plan: checkoutPlan, cycle: checkoutCycle },
      });
      const { url } = await startCheckout(createClient(), {
        approvalId: approval.id,
        plan: checkoutPlan,
        cycle: checkoutCycle,
      });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stripe's page didn't open.");
      setOpeningCheckout(false);
    }
  }

  // A paid plan runs to its period end; a trial (with or without a card)
  // ends now, since nothing has been charged yet.
  const endsNow = !live || live.status === 'trialing';
  const effectiveLabel = endsNow ? 'now' : `on ${dayMonth(live?.current_period_end)}`;

  // P-18 / M-TIER-2: patron billing pauses first, through its own gated
  // action, and the plan changes only once every paying patron is paused,
  // so a Free account never keeps charging anyone.
  async function handleDowngrade() {
    setDowngrading(true);
    setError(null);
    try {
      const supabase = createClient();
      let unnotified = 0;
      if (payingPatrons > 0) {
        const approval = await confirmApproval({
          playerId: player.id,
          actionType: 'patron_billing_pause',
          payload: {},
        });
        const result = await pausePatronBilling(supabase, approval.id);
        if (result.failed.length > 0) {
          setError(
            `Stripe couldn't pause ${result.failed.length === 1 ? '1 patron' : `${result.failed.length} patrons`}, so you're still on ${planName(plan)}. Try again in a moment.`,
          );
          return;
        }
        unnotified = result.unnotified.length;
      }
      const patronNote =
        payingPatrons > 0
          ? ` · billing paused for ${payingPatrons === 1 ? '1 patron' : `${payingPatrons} patrons`}${unnotified > 0 ? ` · ${unnotified} didn't get the email` : ''}`
          : '';
      if (live) {
        const approval = await confirmApproval({
          playerId: player.id,
          actionType: 'subscription_cancel',
          payload: {},
        });
        const result = await cancelPaidPlan(supabase, approval.id);
        await loadSubscription();
        if (result.effective === 'now') {
          onPlayerChange({ tier: 'free', tier_status: 'free' });
          onToast(`Downgraded to Free${patronNote}`);
        } else {
          onToast(`${planName(plan)} ends on ${dayMonth(result.effectiveAt)}${patronNote}`);
        }
      } else {
        await downgradeToFree(supabase);
        onPlayerChange({ tier: 'free', tier_status: 'free' });
        onToast(`Downgraded to Free${patronNote}`);
      }
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The downgrade did not go through.');
    } finally {
      setDowngrading(false);
    }
  }

  const checkoutConsequence = inTrial
    ? `Opens Stripe's page to add a card for ${planName(checkoutPlan)}, ${planPriceLine(checkoutPlan, checkoutCycle)}. The first charge is on ${dayMonth(player.trial_ends_at)}, when your trial ends; downgrade before then and nothing is charged. Your card goes to Stripe, never DeuceX.`
    : `Opens Stripe's page to pay for ${planName(checkoutPlan)}, ${planPriceLine(checkoutPlan, checkoutCycle)}, charged today and then every ${checkoutCycle === 'monthly' ? 'month' : 'year'} until you downgrade. Your card goes to Stripe, never DeuceX.`;

  const showCheckout = !comped && !live && !trialUnused;

  return (
    <Card className="gap-6 p-6">
      <CardHeader className="p-0">
        <CardTitle>Plan &amp; billing</CardTitle>
      </CardHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={plan === 'free' ? 'secondary' : 'ok'}>{planName(plan)}</Badge>
        <span className="text-sm text-muted-foreground">{planLine(player, sub)}</span>
      </div>

      {error && !confirming ? <p className="text-sm text-danger">{error}</p> : null}

      {trialUnused && (
        <div className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-4 text-sm">
          <p className="text-muted-foreground">
            You have a 14-day trial to use, on Pro or Elite. No card to start.
          </p>
          <div className="flex flex-wrap gap-2">
            <StartTrialButton size="sm" onToast={onToast} />
            <StartTrialButton size="sm" plan="elite" label="Start Elite trial" onToast={onToast} />
          </div>
        </div>
      )}

      {live && (
        <div className="rounded-lg bg-secondary/50 p-4 text-sm text-muted-foreground">
          Your card is held by Stripe, never by DeuceX.{' '}
          {live.status === 'trialing'
            ? `The first charge is on ${dayMonth(live.trial_end)}.`
            : live.cancel_at_period_end
              ? `Nothing more is charged; you move to Free on ${dayMonth(live.current_period_end)}.`
              : `Next charge on ${dayMonth(live.current_period_end)}.`}
        </div>
      )}

      {showCheckout && (
        <div className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-4 text-sm">
          <p className="text-muted-foreground">
            {inTrial
              ? `No card yet. Add one before ${dayMonth(player.trial_ends_at)} to stay on ${planName(plan)}; without one you move to Free that day, and nothing is deleted.`
              : 'Pick a plan to pay for. Nothing is deleted on Free, and everything comes back when you upgrade.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={checkoutPlan}
              onValueChange={(v) => isPaidPlan(v) && setCheckoutPlan(v)}
              aria-label="Plan"
            >
              <ToggleGroupItem value="pro">Pro</ToggleGroupItem>
              <ToggleGroupItem value="elite">Elite</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup
              type="single"
              value={checkoutCycle}
              onValueChange={(v) => isBillingCycle(v) && setCheckoutCycle(v)}
              aria-label="Billing cycle"
            >
              <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
              <ToggleGroupItem value="annual">Yearly · {ANNUAL_SAVING_LABEL}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p>
            {planPriceLine(checkoutPlan, checkoutCycle)}
            {approx ? <span className="text-muted-foreground"> (about {approx})</span> : null}
          </p>
          {confirmingCheckout ? (
            <Confirm
              title={
                inTrial ? 'Add a card on Stripe?' : `Pay for ${planName(checkoutPlan)} on Stripe?`
              }
              description={
                <>
                  {checkoutConsequence}
                  {error ? <span className="mt-2 block text-danger">{error}</span> : null}
                </>
              }
              actions={
                <>
                  <Button size="sm" disabled={openingCheckout} onClick={handleCheckout}>
                    Continue to Stripe
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmingCheckout(false)}>
                    Cancel
                  </Button>
                </>
              }
            />
          ) : (
            <Button size="sm" className="self-start" onClick={() => setConfirmingCheckout(true)}>
              {inTrial ? 'Add a card' : `Upgrade to ${planName(checkoutPlan)}`}
            </Button>
          )}
        </div>
      )}

      <PatronPayoutsItem playerId={player.id} plan={plan} />

      <Empty title="No invoices yet">Invoices appear here after the first charge.</Empty>

      {plan !== 'free' && !comped && !live?.cancel_at_period_end && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-6">
          {confirming ? (
            <Confirm
              title={`Downgrade to Free ${effectiveLabel}?`}
              description={
                <>
                  {endsNow
                    ? 'Nothing has been charged, and nothing will be.'
                    : `You keep ${planName(plan)} until then, and nothing more is charged.`}{' '}
                  Financial and Mindset pause. Nothing is deleted: patrons, ledger and notes are
                  retained.
                  {payingPatrons > 0 ? (
                    <>
                      {' '}
                      Patron billing pauses now for{' '}
                      {payingPatrons === 1 ? '1 patron' : `${payingPatrons} patrons`}: nothing more
                      is charged, and each gets this email from you. It resumes at the same price,
                      without re-signup, if you come back to Pro by{' '}
                      {pausedMembershipEndDate(new Date())}; after that, each membership ends.
                      <span className="mt-2 block rounded-md border border-border p-2 text-xs">
                        <span className="block font-medium">{notice.subject}</span>
                        {notice.paragraphs.map((p) => (
                          <span key={p} className="mt-1 block">
                            {p}
                          </span>
                        ))}
                      </span>
                    </>
                  ) : null}
                  {error ? <span className="mt-2 block text-danger">{error}</span> : null}
                </>
              }
              actions={
                <>
                  <Button size="sm" disabled={downgrading} onClick={handleDowngrade}>
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </>
              }
            />
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              Downgrade to Free
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
