'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardHeader, CardTitle, Confirm, Empty } from '@procircuit/ui';
import { downgradeToFree, type Player } from '@procircuit/db';
import { createClient } from '@/lib/supabase/client';

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
  const plan = player.tier ?? 'free';

  async function handleDowngrade() {
    setDowngrading(true);
    try {
      const supabase = createClient();
      await downgradeToFree(supabase, player.id);
      onPlayerChange({ tier: 'free', tier_status: 'free' });
      setConfirming(false);
      onToast('Downgraded to Free');
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

      <Empty title="No invoices yet">Invoices appear here once billing is wired up.</Empty>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-6">
        <Button variant="outline" size="sm" onClick={() => onToast('Elite — coming soon')}>
          See what Elite adds
        </Button>
        {plan !== 'free' &&
          (confirming ? (
            <Confirm
              title={`Downgrade to Free, effective ${nextMonthFirst()}?`}
              description="Financial and Mindset pause. Nothing is deleted — patrons, ledger and notes are retained."
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
