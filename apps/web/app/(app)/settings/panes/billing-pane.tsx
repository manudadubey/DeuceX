'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardHeader, CardTitle, Confirm, Empty } from '@deucex/ui';
import { PatronPayoutsItem } from '@/components/fans/patron-settings';
import { downgradeToFree, type Player } from '@deucex/db';
import { billingPauseNotice, pausedMembershipEndDate } from '@deucex/shared';
import { createClient } from '@/lib/supabase/client';
import { confirmApproval } from '@/lib/approvals/confirm-approval';
import { pausePatronBilling } from '@/lib/fans/api';

const PLAN_PRICE: Record<string, string> = {
  pro: 'A$49 a month',
  elite: 'A$99 a month',
  free: 'Free',
};

function nextMonthFirst(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
}

// PRD-12 §4.4, ST-7/ST-8. No real Stripe Billing subscription exists yet
// (that's a later step) so the card-on-file and invoice history are honest
// empty states rather than fabricated data, and "Downgrade to Free" applies
// immediately (packages/db/src/settings.ts's downgradeToFree, same
// approximation noted there) — the confirmation's "takes effect <date>"
// line is display copy, not a deferred write, flagged in BUILD-LOG.
export function BillingPane({
  player,
  onPlayerChange,
  onToast,
}: {
  player: Player;
  onPlayerChange: (patch: Partial<Player>) => void;
  onToast: (title: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [downgrading, setDowngrading] = useState(false);
  const [payingPatrons, setPayingPatrons] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const plan = player.tier ?? 'free';
  // The confirm shows the notice exactly as patrons will get it, end date included.
  const notice = billingPauseNotice({
    playerName: player.name,
    endsOn: pausedMembershipEndDate(new Date()),
  });

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
            `Stripe couldn't pause ${result.failed.length === 1 ? '1 patron' : `${result.failed.length} patrons`}, so you're still on ${plan}. Try again in a moment.`,
          );
          return;
        }
        unnotified = result.unnotified.length;
      }
      await downgradeToFree(supabase, player.id);
      onPlayerChange({ tier: 'free', tier_status: 'free' });
      setConfirming(false);
      onToast(
        payingPatrons > 0
          ? `Downgraded to Free · billing paused for ${payingPatrons === 1 ? '1 patron' : `${payingPatrons} patrons`}${unnotified > 0 ? ` · ${unnotified} didn't get the email` : ''}`
          : 'Downgraded to Free',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The downgrade did not go through.');
    } finally {
      setDowngrading(false);
    }
  }

  return (
    <Card className="gap-6 p-6">
      <CardHeader className="p-0">
        <CardTitle>Plan &amp; billing</CardTitle>
      </CardHeader>

      <div className="flex items-center gap-2">
        <Badge variant={plan === 'free' ? 'secondary' : 'ok'} className="capitalize">
          {plan}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {PLAN_PRICE[plan] ?? 'Free'}
          {player.billing_cycle ? ` · billed ${player.billing_cycle}` : ''}
        </span>
      </div>

      <div className="rounded-lg bg-secondary/50 p-4 text-sm text-muted-foreground">
        No card on file yet. Real Stripe billing lands in a later build step — nothing here charges
        a card today.
      </div>

      <PatronPayoutsItem playerId={player.id} plan={plan} />

      <Empty title="No invoices yet">Invoices appear here once billing is wired up.</Empty>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-6">
        <Button variant="outline" size="sm" onClick={() => onToast('Elite — coming soon')}>
          See what Elite adds
        </Button>
        {plan !== 'free' &&
          (confirming ? (
            <Confirm
              title={`Downgrade to Free, effective ${nextMonthFirst()}?`}
              description={
                <>
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
          ))}
      </div>
    </Card>
  );
}
