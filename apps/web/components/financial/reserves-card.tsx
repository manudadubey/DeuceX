'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Confirm,
  Field,
  FieldLabel,
  InputGroup,
  InputGroupInput,
} from '@deucex/ui';
import { enterReserveBalance } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';
import { confirmApproval } from '@/lib/approvals/confirm-approval';
import { receiveReceivable, requestFinancialRecompute } from '@/lib/financial/api';
import type { FinancialAction, FinancialSnapshot } from '@/lib/financial/load';
import { receivableProposalRunId } from '@/lib/financial/proposal-link';

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never updated';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Updated just now';
  if (days === 1) return 'Updated 1 day ago';
  return `Updated ${days} days ago`;
}

// "Where reserves come from" (PRD-03 §4.1): the balance input (F-2/F-3, no
// bank connection ever) plus the Pending prize step, whose "Mark received"
// is this build's one real actions-module gated write (F-9, M-DATA-2, the
// same tier TECH-ARCHITECTURE.md section 3 gives Stripe/Resend/ICS calls).
// The consequence sentence sits beside the control (M-GATE-2, packages/ui's
// Confirm) rather than behind a second dialog: confirmApproval creates the
// approvals row through the player's own session, then
// apps/api's /financial/receivables/:id/receive runs markReceivableReceived
// on the service-role client — see docs/BUILD-LOG.md's step 2.2 entry.
export function ReservesCard({
  playerId,
  homeCurrency,
  reserves,
  lastReserveEntryAt,
  pendingReceivables,
  action,
  onToast,
  onSaved,
}: {
  playerId: string;
  homeCurrency: string;
  reserves: number;
  lastReserveEntryAt: string | null;
  pendingReceivables: FinancialSnapshot['pendingReceivables'];
  action: FinancialAction | null;
  onToast: (title: string) => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleUpdate = async () => {
    const parsed = Number(amount);
    if (!(parsed > 0)) return;
    setSaving(true);
    try {
      const previous = reserves;
      await enterReserveBalance(supabase, { playerId, amount: parsed, currency: homeCurrency });
      const diff = parsed - previous;
      const sign = diff >= 0 ? '+' : '−';
      onToast(`Balance updated ${sign}${formatMoney(Math.abs(diff), homeCurrency)}`);
      setAmount('');
      onSaved();
      void requestFinancialRecompute(supabase);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReceived = async (receivableId: string) => {
    setReceivingId(receivableId);
    try {
      const receivedDate = new Date().toISOString().slice(0, 10);
      const approval = await confirmApproval({
        playerId,
        actionType: 'receivable_received',
        payload: { receivableId, receivedDate, realisedHomeCurrency: homeCurrency },
        agentRunId: receivableProposalRunId(action, receivableId),
      });
      const result = await receiveReceivable(supabase, {
        approvalId: approval.id,
        receivableId,
        receivedDate,
        realisedHomeCurrency: homeCurrency,
      });
      onToast(
        `Marked received · reserves now ${formatMoney(result.newReserveBalance, homeCurrency)}`,
      );
      setConfirmingId(null);
      onSaved();
    } finally {
      setReceivingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where reserves come from</CardTitle>
        <CardDescription>{timeAgo(lastReserveEntryAt)}</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-4 px-6">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Cash · entered by you</span>
          <span className="font-mono text-lg font-medium">
            {formatMoney(reserves, homeCurrency)}
          </span>
        </div>
        <Field>
          <FieldLabel>Update balance</FieldLabel>
          <InputGroup>
            <InputGroupInput
              type="number"
              inputMode="decimal"
              placeholder="10450"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </InputGroup>
        </Field>
        <Button onClick={handleUpdate} disabled={saving || !(Number(amount) > 0)}>
          Update
        </Button>

        {pendingReceivables.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            {pendingReceivables.map((r) =>
              confirmingId === r.id ? (
                <Confirm
                  key={r.id}
                  title={`Mark ${r.label} received?`}
                  description={`Adds about ${formatMoney(r.amountHomeEstimate, homeCurrency)} to your reserves at today's rate.`}
                  actions={
                    <>
                      <Button
                        size="sm"
                        disabled={receivingId === r.id}
                        onClick={() => handleConfirmReceived(r.id)}
                      >
                        Confirm
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                        Cancel
                      </Button>
                    </>
                  }
                />
              ) : (
                <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <div className="font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">
                      Pending · expected {r.expectedDate}
                      <Badge variant="secondary" className="ml-1.5">
                        not counted as cash
                      </Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setConfirmingId(r.id)}>
                    Mark received
                  </Button>
                </div>
              ),
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          No bank connection. DeuceX never holds your login or card details; the only money data
          stored is what you type or scan here.
        </p>
      </div>
    </Card>
  );
}
