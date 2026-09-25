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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@deucex/ui';
import { ConfirmAction } from '@/components/confirm-action';
import { aud, dateTime, money, percent, shortDate } from '@/components/format';
import { Grid, PageHeader, PrivacyNote } from '@/components/page';
import type { Money } from '@/lib/api';
import { requireArea, serverApi } from '@/lib/server-api';

const PAYOUT_BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'secondary'> = {
  paid: 'ok',
  scheduled: 'secondary',
  held: 'warn',
  failed: 'danger',
};

// PRD-13 section 4.6. Owner only: support and ops never reach this page or
// its API route (AD-AC-1).
export default async function MoneyPage() {
  await requireArea('money');
  const m = await serverApi<Money>('/admin/money');
  const spendShare =
    m.spend.perPayingPlayerAud !== null ? m.spend.perPayingPlayerAud / m.spend.capAud : null;
  const cat = m.spend.categories;
  const catTotal = cat.transcription + cat.drafting + cat.other || 1;

  return (
    <>
      <PageHeader
        title="Money"
        description="What DeuceX earns, what it costs to run, and what is stuck. Card data, refunds and invoices live in Stripe; this page reconciles against it."
      />

      <StatsRow>
        <Stat>
          <StatLabel>MRR</StatLabel>
          <StatValue>{aud(m.mrr.totalAud)}</StatValue>
          <StatSub>
            Pro {aud(m.mrr.proAud)} · Elite {aud(m.mrr.eliteAud)} · {m.mrr.annual} annual
          </StatSub>
        </Stat>
        <Stat>
          <StatLabel>Platform fee this month</StatLabel>
          <StatValue>
            {m.platformFee.length
              ? m.platformFee.map((f) => money(f.fee, f.currency)).join(' · ')
              : aud(0)}
          </StatValue>
          <StatSub>
            {m.platformFee.length
              ? `on ${m.platformFee.map((f) => money(f.gross, f.currency)).join(' + ')} patron gross`
              : 'No patron payouts yet this month'}
          </StatSub>
        </Stat>
        <Stat>
          <StatLabel>Model and API spend</StatLabel>
          <StatValue>{aud(m.spend.totalAud, 2)}</StatValue>
          <StatSub>
            {aud(m.spend.perPayingPlayerAud, 2)} per paying player · cap {aud(m.spend.capAud, 2)}
          </StatSub>
        </Stat>
        <Stat>
          <StatLabel>Past due</StatLabel>
          <StatValue className={m.pastDue ? 'text-warn' : undefined}>{m.pastDue}</StatValue>
          <StatSub>Stripe retries on its own schedule</StatSub>
        </Stat>
      </StatsRow>

      <PrivacyNote>
        <b className="font-medium text-foreground">Fee basis in force:</b> {m.feeBasis} MRR is{' '}
        {m.mrr.basis.charAt(0).toLowerCase() + m.mrr.basis.slice(1)}
      </PrivacyNote>

      <Grid>
        <Card>
          <CardHeader>
            <CardTitle>Cost to serve</CardTitle>
            <CardDescription>
              Per paying player, this month so far, against the 15 percent cap. {m.spend.rateNote}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['Transcription and extraction', cat.transcription],
                  ['Drafting', cat.drafting],
                  ['Scans and other', cat.other],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg bg-muted p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="font-mono text-lg">{aud(value, 2)}</div>
                  <div className="text-xs text-muted-foreground">{percent(value / catTotal)}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span>
                  {aud(m.spend.perPayingPlayerAud, 2)} of the {aud(m.spend.capAud, 2)} cap
                </span>
                <span className="font-mono">{percent(spendShare)}</span>
              </div>
              <Progress value={(spendShare ?? 0) * 100} />
              <span className="text-xs text-muted-foreground">
                The owner is alerted at 80 percent ({aud(m.spend.capAud * 0.8, 2)}).
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Patron waitlists on Pro</CardTitle>
            <CardDescription>
              Players at the 50-patron cap. The 51st patron sees a waitlist, not an error; Elite
              lifts the cap.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {m.waitlists.length === 0 ? (
              <Empty title="No one is at the cap">
                Pro players with a full page and people waiting appear here.
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead numeric>Patrons</TableHead>
                    <TableHead numeric>Waiting</TableHead>
                    <TableHead className="max-[900px]:hidden">Since</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.waitlists.map((w) => (
                    <TableRow key={w.playerId}>
                      <TableCell>{w.name}</TableCell>
                      <TableCell numeric>{w.patrons}</TableCell>
                      <TableCell numeric>{w.waiting}</TableCell>
                      <TableCell className="max-[900px]:hidden">{shortDate(w.since)}</TableCell>
                      <TableCell className="w-36">
                        <ConfirmAction
                          label="Offer Elite"
                          previewPath={`/admin/players/${w.playerId}/actions/offer_elite/preview`}
                          path={`/admin/players/${w.playerId}/actions/offer_elite`}
                          confirmLabel="Send offer"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Card>
        <CardHeader>
          <CardTitle>Payouts and reconciliation</CardTitle>
          <CardDescription>
            Weekly Express payouts to players. Chargebacks and refund requests are handled in Stripe
            until its webhook is live.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {m.payouts.length === 0 ? (
            <Empty title="No payouts yet">
              Each player&rsquo;s weekly payout appears here once Stripe pays it.
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Week</TableHead>
                  <TableHead numeric>Net</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.playerName}</TableCell>
                    <TableCell>{shortDate(p.week)}</TableCell>
                    <TableCell numeric>{money(p.net, p.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={PAYOUT_BADGE[p.status] ?? 'secondary'} className="capitalize">
                        {p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter>
          <span className="text-xs text-muted-foreground">
            {m.reconciliation.error
              ? `Reconciliation unavailable: ${m.reconciliation.error}`
              : m.reconciliation.lines.length === 0
                ? `Reconciliation at ${dateTime(m.reconciliation.checkedAt)}: no platform balance and no platform fees recorded.`
                : m.reconciliation.lines.map((l) => (
                    <span key={l.currency} className="mr-3">
                      {l.currency}: Stripe platform balance {money(l.stripeMinor / 100, l.currency)}{' '}
                      · fees recorded {money(l.ledgerMinor / 100, l.currency)} ·{' '}
                      <span className={l.matched ? 'text-ok' : 'text-warn'}>
                        {l.matched
                          ? 'matched'
                          : 'differs (platform payouts to the bank are not netted yet)'}
                      </span>
                    </span>
                  ))}
          </span>
        </CardFooter>
      </Card>
    </>
  );
}
