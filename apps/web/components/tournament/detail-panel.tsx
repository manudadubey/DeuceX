'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Confirm,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from '@procircuit/ui';
import { computeRunwayWeeks, type Unit } from '@procircuit/agents';
import { createClient } from '@/lib/supabase/client';
import { daysUntil, type TournamentCandidateView } from '@/lib/tournament/load';
import { useEntryActions } from './use-entry-actions';
import { LockedSection } from './locked-section';
import { ConditionsBrief } from './conditions-brief';

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// PRD-01 section 4.1's detail panel: header, chips, why paragraph, cost
// breakdown, outcome table, Net outcome range rail, and the footer that
// switches by status (T-9 to T-11). The cost/outcome/rail/footer region is
// what Free locks (decisions worksheet 14); the header, chips and why
// paragraph stay live.
export function DetailPanel({
  playerId,
  homeCurrency,
  candidate,
  reserves,
  netBurn,
  isFree,
  unit,
  onUnitChange,
  equipmentMainsKg,
  equipmentCrossesKg,
  onDone,
  onStartTrial,
  onToast,
}: {
  playerId: string;
  homeCurrency: string;
  candidate: TournamentCandidateView;
  reserves: number;
  netBurn: number;
  isFree: boolean;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  equipmentMainsKg: number;
  equipmentCrossesKg: number;
  onDone: () => void;
  onStartTrial: () => void;
  onToast: (title: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { pending, accept, withdraw, skip, undo } = useEntryActions({ supabase, playerId, onDone });
  const [confirming, setConfirming] = useState(false);

  const days = daysUntil(candidate.entryDeadline, new Date());
  const worstRound = candidate.rounds[0];
  const runwayLoseFirst = worstRound
    ? computeRunwayWeeks(reserves + worstRound.net, netBurn)
    : null;

  const busy = pending === candidate.tournamentId;

  const handleAccept = async () => {
    try {
      const result = await accept(candidate.tournamentId);
      onToast(
        `${formatMoney(result.plannedAmount, result.plannedCurrency)} logged as a planned expense · Entered`,
      );
      setConfirming(false);
    } catch {
      onToast("Couldn't log that entry — try again.");
    }
  };

  const handleSkip = async () => {
    try {
      await skip(candidate.tournamentId);
      onToast('Skipped. The agent will drop it from next week’s run.');
    } catch {
      onToast("Couldn't skip — try again.");
    }
  };

  const handleWithdraw = async () => {
    try {
      await withdraw(candidate.tournamentId);
      onToast(`Withdrawn from ${candidate.name}`);
    } catch {
      onToast('The entry deadline has passed — withdraw on the player zone instead.');
    }
  };

  const handleUndo = async () => {
    try {
      await undo(candidate.tournamentId);
      onToast('Undone.');
    } catch {
      onToast("Couldn't undo — try again.");
    }
  };

  const costAndOutcome = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 max-[700px]:grid-cols-1">
        <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Flights</dt>
          <dd className="text-right font-mono">
            {formatMoney(candidate.cost.flights, homeCurrency)}
          </dd>
          <dt className="text-muted-foreground">Accommodation · {candidate.cost.nights}n</dt>
          <dd className="text-right font-mono">
            {formatMoney(candidate.cost.accommodation, homeCurrency)}
          </dd>
          {candidate.cost.coach > 0 && (
            <>
              <dt className="text-muted-foreground">Coach block</dt>
              <dd className="text-right font-mono">
                {formatMoney(candidate.cost.coach, homeCurrency)}
              </dd>
            </>
          )}
          {candidate.cost.entry > 0 && (
            <>
              <dt className="text-muted-foreground">Entry fee</dt>
              <dd className="text-right font-mono">
                {formatMoney(candidate.cost.entry, homeCurrency)}
              </dd>
            </>
          )}
          <dt className="font-medium text-foreground">Cost to go</dt>
          <dd className="text-right font-mono font-medium text-danger">
            −{formatMoney(candidate.cost.total, homeCurrency)}
          </dd>
        </dl>

        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Result</TableHead>
                <TableHead>Prize</TableHead>
                <TableHead>Pts</TableHead>
                <TableHead>Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidate.rounds.map((r) => (
                <TableRow key={r.label}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="font-mono">{formatMoney(r.prize, homeCurrency)}</TableCell>
                  <TableCell className="font-mono">{r.points}</TableCell>
                  <TableCell className="font-mono">
                    {r.net >= 0 ? '+' : ''}
                    {formatMoney(r.net, homeCurrency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      </div>

      <div className="rounded-lg bg-sidebar-accent p-3 text-xs">
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
        <div className="mt-2 flex justify-between font-mono text-[0.7rem] text-muted-foreground">
          <span>{formatMoney(candidate.lo, homeCurrency)}</span>
          <span>{formatMoney(candidate.hi, homeCurrency)}</span>
        </div>
      </div>
    </div>
  );

  const footer = (
    <div className="flex items-center gap-2">
      {candidate.status === 'entered' ? (
        <>
          <Badge variant="ok">Entered</Badge>
          <Button size="sm" variant="outline" disabled={busy} onClick={handleWithdraw}>
            Withdraw
          </Button>
        </>
      ) : candidate.status === 'skipped' ? (
        <>
          <Badge variant="secondary">Skipped</Badge>
          <span className="text-xs text-muted-foreground">
            The agent will drop it from next week&apos;s run.
          </span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={handleUndo}>
            Undo
          </Button>
        </>
      ) : candidate.status === 'withdrawn' ? (
        <Badge variant="secondary">Withdrawn</Badge>
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
              <Button size="sm" disabled={busy} onClick={handleAccept}>
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          }
        />
      ) : (
        <>
          <Button size="sm" disabled={busy} onClick={() => setConfirming(true)}>
            Accept entry
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={handleSkip}>
            Skip
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{candidate.name}</h2>
        <p className="text-sm text-muted-foreground">
          {candidate.tier ?? 'Tier n/a'} · {candidate.surface ?? 'Surface n/a'} ·{' '}
          {candidate.city ? `${candidate.city}, ${candidate.country ?? ''}` : 'Location n/a'} ·{' '}
          {candidate.startDate} – {candidate.endDate}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {candidate.entryDeadline && (
          <Badge variant={days != null && days <= 10 ? 'warn' : 'secondary'}>
            {candidate.status === 'none'
              ? `Entry closes ${candidate.entryDeadline}`
              : candidate.status}
          </Badge>
        )}
        {candidate.defendPoints ? (
          <Badge variant="warn">Defending {candidate.defendPoints} pts</Badge>
        ) : null}
      </div>

      <p className="text-sm">{candidate.why}</p>

      {candidate.conditions && (
        <ConditionsBrief
          conditions={candidate.conditions}
          mainsKg={equipmentMainsKg}
          crossesKg={equipmentCrossesKg}
          isFree={isFree}
          unit={unit}
          onUnitChange={onUnitChange}
          onStartTrial={onStartTrial}
        />
      )}

      {isFree ? (
        <LockedSection onStartTrial={onStartTrial}>
          {costAndOutcome}
          <div className="mt-4">{footer}</div>
        </LockedSection>
      ) : (
        <>
          {costAndOutcome}
          {footer}
        </>
      )}
    </div>
  );
}
