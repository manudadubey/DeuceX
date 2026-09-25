import { ShieldCheck } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
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
import { dateTime, shortDate } from '@/components/format';
import { Grid, PageHeader, PrivacyNote } from '@/components/page';
import type { Trust } from '@/lib/api';
import { requireArea, serverApi } from '@/lib/server-api';

const KIND: Record<
  string,
  { label: string; rule: string; primary: { outcome: string; label: string; consequence: string } }
> = {
  distress: {
    label: 'Distress pattern',
    rule: 'A person must confirm within 24 hours that the "Someone to call" card was shown. It cannot be closed by dismissal alone.',
    primary: {
      outcome: 'card_confirmed',
      label: 'Confirm the card was shown',
      consequence:
        'Records that the "Someone to call" card was shown and closes the case. The note itself is never opened.',
    },
  },
  report: {
    label: 'Report',
    rule: 'Show the report text only, never the conversation; withdrawing the answer is the safe default.',
    primary: {
      outcome: 'answer_withdrawn',
      label: 'Withdraw the answer',
      consequence: 'Withdraws the reported answer and closes the case; the player is told.',
    },
  },
  guardian: {
    label: 'Guardian unconfirmed',
    rule: 'An under-18 account stays limited until a guardian confirms.',
    primary: {
      outcome: 'guardian_resent',
      label: 'Resend to the guardian',
      consequence: 'Resends the confirmation to the guardian address on file.',
    },
  },
  governance: {
    label: 'Real-person governance',
    rule: 'Demo accounts that use a real name show public facts only, labelled illustrative, with no photograph.',
    primary: {
      outcome: 'dismissed',
      label: 'Mark fixed',
      consequence: 'Closes the case once the failing check has been fixed.',
    },
  },
};

// PRD-13 section 4.7.
export default async function TrustPage() {
  const [, t] = await Promise.all([requireArea('trust'), serverApi<Trust>('/admin/trust')]);
  const byKind = t.cases.reduce<Record<string, number>>(
    (acc, c) => ({ ...acc, [c.kind]: (acc[c.kind] ?? 0) + 1 }),
    {},
  );
  const earliest = t.deletions[0]?.effectiveAt ?? null;

  return (
    <>
      <PageHeader
        title="Trust and safety"
        description="Cases that need a person. Player notes are never opened from here; a case shows only the sentence that tripped the rule or the report text."
      />

      <StatsRow>
        <Stat>
          <StatLabel>Open cases</StatLabel>
          <StatValue>{t.cases.length}</StatValue>
          <StatSub>
            {Object.entries(byKind)
              .map(([k, n]) => `${n} ${KIND[k]?.label.toLowerCase() ?? k}`)
              .join(' · ') || 'None open'}
          </StatSub>
        </Stat>
        <Stat>
          <StatLabel>&ldquo;Someone to call&rdquo; shown</StatLabel>
          <StatValue>
            {t.distressCardsThisMonth} <small>this month</small>
          </StatValue>
          <StatSub>A count only; the content never leaves the player&rsquo;s view</StatSub>
        </Stat>
        <Stat>
          <StatLabel>Delete requests</StatLabel>
          <StatValue>{t.deletions.length}</StatValue>
          <StatSub>
            {earliest
              ? `In the 14-day cooling-off · earliest ${shortDate(earliest)}`
              : 'None in cooling-off'}
          </StatSub>
        </Stat>
        <Stat>
          <StatLabel>Export requests</StatLabel>
          <StatValue>{t.exports.length}</StatValue>
          <StatSub>{t.exports.filter((e) => e.deliveredAt).length} delivered</StatSub>
        </Stat>
      </StatsRow>

      <Card>
        <CardHeader>
          <CardTitle>Cases</CardTitle>
          <CardDescription>
            Oldest first. Resolving a case writes the outcome to the audit log; the player is told
            when it concerned their account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {t.cases.length === 0 ? (
            <Empty icon={<ShieldCheck className="size-4" />} title="No open cases">
              Cases open by rule: a distress pattern, a report, a guardian timeout or a failed
              governance check.
            </Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {t.cases.map((c) => {
                const kind = KIND[c.kind] ?? KIND.governance!;
                return (
                  <li
                    key={c.id}
                    className="flex flex-col gap-2 rounded-lg p-4 shadow-[0_0_0_1px_var(--border)]"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant={c.kind === 'distress' ? 'danger' : 'warn'}>
                        {kind.label}
                      </Badge>
                      <span className="font-medium">{c.playerName}</span>
                      <span className="text-xs text-muted-foreground">
                        opened {dateTime(c.openedAt)} by rule {c.rule}
                      </span>
                      {c.dueAt ? (
                        <Badge variant={c.overdue ? 'danger' : 'secondary'} className="ml-auto">
                          {c.overdue ? 'Overdue' : `Due ${dateTime(c.dueAt)}`}
                        </Badge>
                      ) : null}
                    </div>
                    <blockquote className="border-l-2 border-border pl-3 text-sm">
                      {c.excerpt}
                    </blockquote>
                    <p className="text-xs text-muted-foreground">{kind.rule}</p>
                    <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                      {c.kind === 'guardian' ? (
                        <p className="text-[0.8125rem] text-muted-foreground">
                          The guardian confirmation email isn&rsquo;t built yet, so there is nothing
                          to resend.
                        </p>
                      ) : (
                        <ConfirmAction
                          label={kind.primary.label}
                          path={`/admin/cases/${c.id}/resolve`}
                          body={{ outcome: kind.primary.outcome }}
                          consequence={kind.primary.consequence}
                          variant="primary"
                          reasonOptional
                          confirmLabel="Confirm"
                        />
                      )}
                      {c.kind !== 'distress' ? (
                        <ConfirmAction
                          label="Dismiss"
                          path={`/admin/cases/${c.id}/resolve`}
                          body={{ outcome: 'dismissed' }}
                          consequence="Closes the case with no change to the account."
                          reasonRequired
                          variant="ghost"
                          confirmLabel="Dismiss"
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Grid>
        <Card>
          <CardHeader>
            <CardTitle>Data requests</CardTitle>
            <CardDescription>
              Delete and export requests from Settings, Data and safety, or started by staff.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {t.deletions.length + t.exports.length === 0 ? (
              <Empty title="No data requests">
                Deletions in cooling-off and exports appear here.
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Request</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {t.deletions.map((d) => (
                    <TableRow key={`d-${d.playerId}`}>
                      <TableCell>{d.name}</TableCell>
                      <TableCell>Delete account</TableCell>
                      <TableCell>
                        <Badge variant="warn">
                          {d.daysLeft} day{d.daysLeft === 1 ? '' : 's'} left
                        </Badge>
                      </TableCell>
                      <TableCell className="w-40">
                        <ConfirmAction
                          label="Cancel"
                          previewPath={`/admin/players/${d.playerId}/actions/cancel_deletion/preview`}
                          path={`/admin/players/${d.playerId}/actions/cancel_deletion`}
                          reasonOptional
                          variant="ghost"
                          confirmLabel="Cancel deletion"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {t.exports.map((e) => (
                    <TableRow key={`e-${e.playerId}`}>
                      <TableCell>{e.name}</TableCell>
                      <TableCell>Export</TableCell>
                      <TableCell>
                        <Badge variant={e.deliveredAt ? 'ok' : 'secondary'}>
                          {e.deliveredAt ? `Delivered ${shortDate(e.deliveredAt)}` : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Real-person governance</CardTitle>
            <CardDescription>
              Demo accounts that use a real player&rsquo;s name: public facts only, private data
              labelled illustrative, no photographs without licence.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Empty title="No demo accounts registered">
              Demo accounts and their nightly checks arrive with the governance check job; a failing
              check will open a case here.
            </Empty>
            <PrivacyNote>
              Model providers used, with no training on player data: a structured-output language
              model and speech transcription. This matches what players see under Data and safety.
            </PrivacyNote>
          </CardContent>
        </Card>
      </Grid>
    </>
  );
}
