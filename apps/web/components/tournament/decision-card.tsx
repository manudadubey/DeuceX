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
} from '@procircuit/ui';
import { computeRunwayWeeks } from '@procircuit/agents';
import { createClient } from '@/lib/supabase/client';
import { daysUntil, type TournamentCandidateView } from '@/lib/tournament/load';
import { useEntryActions } from './use-entry-actions';

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// PRD-01 section 4.2, the dashboard decision card: the single top pick with
// the nearest undecided deadline, its cost/outcome/runway consequence and
// the two-step Accept entry control (M-GATE-2: the consequence sentence
// sits beside the control, packages/ui's Confirm, not behind a second
// dialog).
export function DecisionCard({
  playerId,
  homeCurrency,
  candidate,
  reserves,
  netBurn,
  onDone,
}: {
  playerId: string;
  homeCurrency: string;
  candidate: TournamentCandidateView;
  reserves: number;
  netBurn: number;
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { pending, accept, withdraw } = useEntryActions({ supabase, playerId, onDone });
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const days = daysUntil(candidate.entryDeadline, new Date());
  const worstRound = candidate.rounds[0];
  const bestRound = candidate.rounds[candidate.rounds.length - 1];
  const runwayLoseFirst =
    worstRound != null ? computeRunwayWeeks(reserves + worstRound.net, netBurn) : null;
  const runwayReachBest =
    bestRound != null ? computeRunwayWeeks(reserves + bestRound.net, netBurn) : null;

  const handleAccept = async () => {
    try {
      const result = await accept(candidate.tournamentId);
      setToast(
        `${formatMoney(result.plannedAmount, result.plannedCurrency)} logged as a planned expense · Entered`,
      );
      setConfirming(false);
    } catch {
      setToast("Couldn't log that entry — try again.");
    }
  };

  const handleWithdraw = async () => {
    try {
      await withdraw(candidate.tournamentId);
      setToast(`Withdrawn from ${candidate.name}`);
    } catch {
      setToast("Couldn't withdraw — the entry deadline may already have passed.");
    }
  };

  return (
    <Card className="p-5">
      <CardHeader className="p-0">
        <CardTitle>This week&apos;s decision · {candidate.name}</CardTitle>
        <CardDescription>
          Tournament Agent&apos;s top pick, ranked by cost-to-prize. Entry closes{' '}
          {candidate.entryDeadline ?? 'soon'}.
        </CardDescription>
      </CardHeader>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{candidate.tier ?? 'Tier n/a'}</Badge>
        <Badge variant="secondary">{candidate.surface ?? 'Surface n/a'}</Badge>
        <Badge variant="secondary">
          {candidate.city ? `${candidate.city}, ${candidate.country ?? ''}` : 'Location n/a'}
        </Badge>
        {days != null && (
          <Badge variant={days <= 10 ? 'warn' : 'secondary'}>{days} days to decide</Badge>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm max-[700px]:grid-cols-1">
        <dl className="grid grid-cols-2 gap-y-1.5">
          <dt className="text-muted-foreground">Cost to go</dt>
          <dd className="text-right font-mono text-danger">
            −{formatMoney(candidate.cost.total, homeCurrency)}
          </dd>
          {worstRound && (
            <>
              <dt className="text-muted-foreground">{worstRound.label}</dt>
              <dd className="text-right font-mono">
                {formatMoney(worstRound.prize, homeCurrency)}{' '}
                <span className="text-muted-foreground">
                  → {worstRound.net >= 0 ? '+' : ''}
                  {formatMoney(worstRound.net, homeCurrency)}
                </span>
              </dd>
            </>
          )}
          {bestRound && bestRound !== worstRound && (
            <>
              <dt className="text-muted-foreground">{bestRound.label}</dt>
              <dd className="text-right font-mono">
                {formatMoney(bestRound.prize, homeCurrency)}{' '}
                <span className="text-muted-foreground">
                  → {bestRound.net >= 0 ? '+' : ''}
                  {formatMoney(bestRound.net, homeCurrency)}
                </span>
              </dd>
            </>
          )}
        </dl>
        <div className="flex flex-col gap-2 rounded-lg bg-sidebar-accent p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Net outcome range</span>
            <span>
              Expected{' '}
              <b className="font-mono">
                {candidate.exp >= 0 ? '+' : ''}
                {formatMoney(candidate.exp, homeCurrency)}
              </b>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-2">
            <div>
              <div className="text-muted-foreground">
                Runway if you lose {worstRound?.label.replace('Lose ', '')}
              </div>
              <div className="font-mono font-medium">
                {runwayLoseFirst != null && Number.isFinite(runwayLoseFirst)
                  ? `${runwayLoseFirst.toFixed(1)} wks`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">
                Runway if you reach {bestRound?.label.replace('Reach ', '')}
              </div>
              <div className="font-mono font-medium">
                {runwayReachBest != null && Number.isFinite(runwayReachBest)
                  ? `${runwayReachBest.toFixed(1)} wks`
                  : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {candidate.status === 'entered' ? (
          <div className="flex items-center gap-2">
            <Badge variant="ok">Entered</Badge>
            <Button
              size="sm"
              variant="outline"
              disabled={pending === candidate.tournamentId}
              onClick={handleWithdraw}
            >
              Withdraw
            </Button>
          </div>
        ) : confirming ? (
          <Confirm
            title={`${formatMoney(candidate.cost.total, homeCurrency)} logged as a planned expense`}
            description={
              runwayLoseFirst != null && Number.isFinite(runwayLoseFirst)
                ? `Runway after an R1 loss: ${runwayLoseFirst.toFixed(1)} wks.`
                : 'Confirms this entry and adds it to your ledger.'
            }
            actions={
              <>
                <Button
                  size="sm"
                  disabled={pending === candidate.tournamentId}
                  onClick={handleAccept}
                >
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            }
          />
        ) : (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={pending === candidate.tournamentId}
              onClick={() => setConfirming(true)}
            >
              Accept entry
            </Button>
          </div>
        )}
      </div>

      {toast && <p className="mt-2 text-xs text-muted-foreground">{toast}</p>}
    </Card>
  );
}
