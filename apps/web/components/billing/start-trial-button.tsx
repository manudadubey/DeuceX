'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Confirm, type ButtonProps } from '@deucex/ui';
import { TrialUnavailableError, startTrial } from '@deucex/db';
import {
  TRIAL_DAYS,
  TRIAL_REMINDER_DAYS_BEFORE_END,
  planPriceLine,
  type PaidPlan,
} from '@deucex/shared';
import { createClient } from '@/lib/supabase/client';

const DAY_MS = 24 * 60 * 60 * 1000;

function dayMonth(date: Date): string {
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
}

/** The trial's consequence sentence: price, recipient, timing, what happens without a card. */
export function trialConsequence(plan: PaidPlan, now: Date = new Date()): string {
  const name = plan === 'pro' ? 'Pro' : 'Elite';
  const ends = dayMonth(new Date(now.getTime() + TRIAL_DAYS * DAY_MS));
  const cardDay = dayMonth(
    new Date(now.getTime() + (TRIAL_DAYS - TRIAL_REMINDER_DAYS_BEFORE_END) * DAY_MS),
  );
  return (
    `Everything in ${name}, free until ${ends}. No card now: on ${cardDay} we'll ask for one on ` +
    `Stripe's page, ${planPriceLine(plan, 'monthly')} from ${ends}. Without one you move back to ` +
    `Free on ${ends}, and nothing is deleted.`
  );
}

// M-TIER-1's single upgrade action on every locked surface. The first tap
// checks whether the once-per-player trial is still unused: if so it opens
// the consequence sentence in place (Baseline's inline Confirm), and
// confirming starts the trial through start_trial. If the trial has been
// used, or the player is already on a paid plan, it goes to Plan & billing,
// where a card can be added.
export function StartTrialButton({
  onToast,
  plan = 'pro',
  label = 'Start Pro trial',
  size,
  className,
}: {
  onToast: (title: string) => void;
  plan?: PaidPlan;
  label?: string;
  size?: ButtonProps['size'];
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'checking' | 'confirm' | 'starting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const name = plan === 'pro' ? 'Pro' : 'Elite';

  async function open() {
    setState('checking');
    setError(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { data: player } = auth.user
      ? await supabase
          .from('players')
          .select('trial_started_at, tier_status')
          .eq('id', auth.user.id)
          .maybeSingle()
      : { data: null };
    if (!player || player.trial_started_at || (player.tier_status ?? 'free') !== 'free') {
      router.push('/settings?pane=billing');
      return;
    }
    setState('confirm');
  }

  async function start() {
    setState('starting');
    try {
      await startTrial(createClient(), plan, 'monthly');
      onToast(`${name} trial started · 14 days, card asked for on day 12`);
      setState('idle');
      router.refresh();
    } catch (err) {
      if (err instanceof TrialUnavailableError) {
        router.push('/settings?pane=billing');
        return;
      }
      setError("The trial didn't start. Try again in a moment.");
      setState('confirm');
    }
  }

  if (state === 'confirm' || state === 'starting') {
    return (
      <Confirm
        className="max-w-[34rem] text-left"
        title={`Start your 14-day ${name} trial?`}
        description={
          <>
            {trialConsequence(plan)}
            {error && <span className="mt-1 block text-destructive">{error}</span>}
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setState('idle')}>
              Not now
            </Button>
            <Button size="sm" onClick={start} disabled={state === 'starting'}>
              Start trial
            </Button>
          </>
        }
      />
    );
  }

  return (
    <Button size={size} className={className} onClick={open} disabled={state === 'checking'}>
      {label}
    </Button>
  );
}
