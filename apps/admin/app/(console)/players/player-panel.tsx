import { ShieldAlert, UserRound } from 'lucide-react';
import type { AdminRole } from '@deucex/shared';
import { Badge, Card, CardContent, Empty } from '@deucex/ui';
import { ConfirmAction } from '@/components/confirm-action';
import { actionLabel, dateTime, longDate, relative, shortDate } from '@/components/format';
import { PrivacyNote } from '@/components/page';
import type { PlayerDetail } from '@/lib/api';
import { STATUS_BADGE } from './status';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 py-1.5 text-[0.8125rem]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1 border-t border-border pt-3">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const STAGE_LABEL: Record<string, string> = {
  '1': 'Building',
  '2': 'Emerging',
  '3': 'Established',
};

// The sticky detail panel (PRD-13 section 4.3, AD-8, AD-9): identity, the
// guardian notice for minors, account, share links, actions, the privacy
// notice, the player's audit log with admin actions marked, and the owner's
// danger zone. Every action is a two-step with a server-built consequence.
export function PlayerPanel({ player, role }: { player: PlayerDetail; role: AdminRole }) {
  const base = `/admin/players/${player.id}/actions`;
  const action = (name: string) => ({
    previewPath: `${base}/${name}/preview`,
    path: `${base}/${name}`,
  });
  const deleting =
    player.deletionEffectiveAt !== null && new Date(player.deletionEffectiveAt) > new Date();

  return (
    <Card className="sticky top-20 max-[1100px]:static">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-chart-2 text-sm font-semibold text-[oklch(0.2_0.05_131)]">
            {initials(player.name)}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{player.name}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{player.country}</span>
              {player.ranking ? <span className="font-mono">· {player.ranking}</span> : null}
              {player.stage ? (
                <span>
                  · {STAGE_LABEL[player.stage] ?? player.stage}
                  {player.stagePinned ? ' (pinned)' : ' (detected)'}
                </span>
              ) : null}
            </div>
          </div>
          <Badge variant={STATUS_BADGE[player.status]} className="ml-auto">
            {player.status}
          </Badge>
        </div>

        {player.guardian ? (
          <div className="flex gap-2 rounded-lg bg-warn-bg p-3 text-[0.8125rem] text-warn">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Under 18 ({player.age}). Guardian {player.guardian.email ?? 'not given'}:{' '}
              {player.guardian.confirmedAt
                ? `confirmed ${shortDate(player.guardian.confirmedAt)}.`
                : 'not yet confirmed. The public profile stays off and sharing is limited until they confirm.'}
            </span>
          </div>
        ) : null}

        <Section title="Account">
          <dl>
            <Row label="Email">{player.email}</Row>
            <Row label="Signed up">
              {longDate(player.signedUpAt)} · {player.signUpChannel}
            </Row>
            <Row label="Plan">
              {player.tier.charAt(0).toUpperCase() + player.tier.slice(1)}
              {player.billingCycle ? ` · ${player.billingCycle}` : ''}
              {player.trialEndsAt ? ` · trial ends ${longDate(player.trialEndsAt)}` : ''}
              {player.comp
                ? ` · comped ${player.comp.tier} until ${longDate(player.comp.until)}`
                : ''}
            </Row>
            <Row label="Verification">
              {player.verification}
              {player.verificationSource ? ` · ${player.verificationSource}` : ''}
            </Row>
            <Row label="Ranking ids">
              <span className="font-mono text-xs">
                {player.tourPlayerId ?? '–'} · ITF {player.itfId ?? '–'}
              </span>
            </Row>
            <Row label="Currency, time zone">
              {player.homeCurrency} · {player.timezone}
            </Row>
            <Row label="Languages">{player.languages.join(', ')}</Row>
            <Row label="Agent schedule">
              {player.agentSchedule.allPaused
                ? 'All scheduled agents paused'
                : player.agentSchedule.paused.length
                  ? `Paused: ${player.agentSchedule.paused.join(', ')}`
                  : 'Running'}
            </Row>
            <Row label="Model spend">
              <span className="font-mono">US${player.modelSpendUsd.toFixed(4)}</span> this month
            </Row>
            {deleting ? (
              <Row label="Deletion">
                <span className="text-danger">
                  Scheduled for {longDate(player.deletionEffectiveAt)}
                </span>
              </Row>
            ) : null}
          </dl>
        </Section>

        <Section title="Share links">
          {player.shareLinks.length === 0 ? (
            <p className="text-[0.8125rem] text-muted-foreground">No coach or manager links.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {player.shareLinks.map((link) => (
                <li key={link.id} className="flex flex-col gap-1.5 text-[0.8125rem]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{link.scope}</span>
                    {link.revoked ? <Badge variant="secondary">Revoked</Badge> : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      opened {relative(link.lastOpenedAt)} · expires {shortDate(link.expiresAt)}
                    </span>
                  </div>
                  {!link.revoked ? (
                    <ConfirmAction
                      label="Revoke"
                      title={`Revoke the ${link.scope} link`}
                      {...action('revoke_share_link')}
                      body={{ linkId: link.id }}
                      reasonOptional
                      destructive
                      confirmLabel="Revoke link"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Actions">
          <div className="flex flex-col gap-2">
            <ConfirmAction
              label="Send magic link"
              {...action('magic_link')}
              reasonOptional
              confirmLabel="Send link"
            />
            <ConfirmAction
              label="Re-verify ranking"
              {...action('reverify')}
              reasonOptional
              confirmLabel="Re-verify"
            />
            <ConfirmAction
              label="Extend trial 14 days"
              {...action('trial_extend')}
              reasonOptional
              confirmLabel="Extend trial"
            />
            {role === 'owner' ? (
              <ConfirmAction
                label="Comp Elite one month"
                {...action('comp')}
                reasonRequired
                confirmLabel="Comp Elite"
              />
            ) : null}
            {player.agentSchedule.allPaused ? (
              <ConfirmAction
                label="Resume agents"
                {...action('resume_agents')}
                reasonOptional
                confirmLabel="Resume agents"
              />
            ) : (
              <ConfirmAction
                label="Pause agents"
                {...action('pause_agents')}
                reasonOptional
                confirmLabel="Pause agents"
              />
            )}
            <ConfirmAction
              label="Export data"
              {...action('export_data')}
              reasonOptional
              confirmLabel="Send export"
            />
            {deleting ? (
              <ConfirmAction
                label="Cancel deletion (at the player's request)"
                {...action('cancel_deletion')}
                reasonOptional
                confirmLabel="Cancel deletion"
              />
            ) : null}
          </div>
        </Section>

        <PrivacyNote>
          The console never shows note transcripts, audio, Fuel or receipt photographs, moods by
          date or Fan Agent conversations. Support works from this panel and the player&rsquo;s own
          audit log.
        </PrivacyNote>

        <Section title="Audit log">
          {player.auditLog.length === 0 ? (
            <Empty icon={<UserRound className="size-4" />} title="Nothing recorded yet">
              Player approvals and staff actions on this account appear here, newest first.
            </Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {player.auditLog.slice(0, 20).map((entry) => (
                <li key={`${entry.actor}-${entry.id}`} className="text-[0.8125rem]">
                  <div className="flex items-center gap-2">
                    {entry.actor === 'admin' ? (
                      <Badge variant="warn">Admin</Badge>
                    ) : (
                      <Badge variant="secondary">Player</Badge>
                    )}
                    <span className="font-medium">{actionLabel(entry.action)}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {dateTime(entry.at)}
                    </span>
                  </div>
                  {entry.actor === 'admin' ? (
                    <p className="mt-0.5 text-muted-foreground">
                      {entry.actorName} ({entry.role}){entry.reason ? `: “${entry.reason}”` : ''}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {role === 'owner' ? (
          <section className="flex flex-col gap-2 rounded-lg p-3 shadow-[0_0_0_1px_var(--destructive)]">
            <h3 className="text-sm font-medium text-danger">Danger zone</h3>
            <p className="text-[0.8125rem] text-muted-foreground">
              Deleting starts the 14-day cooling-off. The player is emailed at once and can cancel
              until the date.
            </p>
            {deleting ? (
              <p className="text-[0.8125rem]">
                Already scheduled for {longDate(player.deletionEffectiveAt)}.
              </p>
            ) : (
              <ConfirmAction
                label="Delete account"
                title="Delete this account"
                {...action('delete_account')}
                reasonRequired
                destructive
                variant="outline"
                confirmLabel="Start cooling-off"
              />
            )}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
