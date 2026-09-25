import { Cpu } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
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
  TableCellSub,
  TableHead,
  TableHeader,
  TableRow,
} from '@deucex/ui';
import { BarChart, Legend } from '@/components/charts';
import { ConfirmAction } from '@/components/confirm-action';
import { aud, dateTime, duration, percent } from '@/components/format';
import { Grid, PageHeader } from '@/components/page';
import type { AgentHealth } from '@/lib/api';
import { requireArea, serverApi } from '@/lib/server-api';
import { KillSwitch } from './kill-switch';
import { RefreshButton } from './refresh-button';

// PRD-13 section 4.4.
export default async function AgentsPage() {
  const me = await requireArea('agents');
  const h = await serverApi<AgentHealth>('/admin/agents');
  const s = h.stats;

  return (
    <>
      <PageHeader
        title="Agent health"
        description="Every run, what it cost, and whether players acted on it. Pausing an agent stops proposals; it never touches anything already approved."
        actions={<RefreshButton />}
      />

      <StatsRow>
        <Stat>
          <StatLabel>Runs today</StatLabel>
          <StatValue>{s.runsToday}</StatValue>
          <StatSub>
            Scheduled {s.scheduledToday} · on demand {s.onDemandToday}
          </StatSub>
        </Stat>
        <Stat>
          <StatLabel>Failed</StatLabel>
          <StatValue className={s.failedToday || s.openFailures ? 'text-danger' : undefined}>
            {s.failedToday}
          </StatValue>
          <StatSub>
            {s.runsToday ? percent(s.failedToday / s.runsToday) : '0%'} · {s.openFailures} still
            listed
          </StatSub>
        </Stat>
        <Stat>
          <StatLabel>Median latency</StatLabel>
          <StatValue>{duration(s.p50Ms)}</StatValue>
          <StatSub>p95 {duration(s.p95Ms)} · target under 2 minutes</StatSub>
        </Stat>
        <Stat>
          <StatLabel>Cost today</StatLabel>
          <StatValue>{aud(s.costTodayAud, 2)}</StatValue>
          <StatSub>{aud(s.costPerRunAud, 4)} per run · transcription not yet metered</StatSub>
        </Stat>
      </StatsRow>

      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
          <CardDescription>
            Seven-day window from the nightly aggregation. Approval is the share of proposal-bearing
            runs with an approval inside 48 hours; dismiss is the share explicitly dismissed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead numeric>Runs</TableHead>
                <TableHead numeric className="max-[900px]:hidden">
                  Success
                </TableHead>
                <TableHead numeric className="max-[900px]:hidden">
                  p50
                </TableHead>
                <TableHead numeric className="max-[900px]:hidden">
                  Cost/run
                </TableHead>
                <TableHead>Approval</TableHead>
                <TableHead className="max-[900px]:hidden">Dismiss</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {h.agents.map((a) => (
                <TableRow key={a.name}>
                  <TableCell>
                    {a.label}
                    <TableCellSub>{a.cadence}</TableCellSub>
                  </TableCell>
                  <TableCell numeric>{a.runs7d}</TableCell>
                  <TableCell numeric className="max-[900px]:hidden">
                    {percent(a.successRate)}
                  </TableCell>
                  <TableCell numeric className="max-[900px]:hidden">
                    {duration(a.p50Ms)}
                  </TableCell>
                  <TableCell numeric className="max-[900px]:hidden">
                    {aud(a.costPerRunAud, 4)}
                  </TableCell>
                  <TableCell className="min-w-28">
                    {a.approvalRate === null ? (
                      <span
                        className="text-xs text-muted-foreground"
                        title="Approvals are not linked to agent runs yet"
                      >
                        Not measured
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Progress value={a.approvalRate * 100} className="w-16" />
                        <span className="font-mono text-xs">{percent(a.approvalRate)}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs max-[900px]:hidden">
                    {percent(a.dismissRate)}
                  </TableCell>
                  <TableCell>
                    {a.paused ? (
                      <Badge variant="secondary">Paused</Badge>
                    ) : a.underThreshold ? (
                      <Badge variant="danger">Under threshold</Badge>
                    ) : (
                      <Badge variant="ok">Healthy</Badge>
                    )}
                  </TableCell>
                  <TableCell className="w-36">
                    {a.pausable ? (
                      <ConfirmAction
                        label={a.paused ? 'Resume' : 'Pause'}
                        title={`${a.paused ? 'Resume' : 'Pause'} the ${a.label}`}
                        path={`/admin/agents/${encodeURIComponent(a.name)}/pause`}
                        body={{ paused: !a.paused }}
                        consequence={
                          a.paused
                            ? `Resumes the ${a.label} for every player from its next scheduled run.`
                            : `Pauses the ${a.label} for every player now: no new proposals until resumed. Nothing approved is undone, and players see a notice on its page.`
                        }
                        reasonOptional
                        confirmLabel={a.paused ? 'Resume' : 'Pause'}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Runs on its own trigger</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Grid>
        <Card>
          <CardHeader>
            <CardTitle>Failed runs</CardTitle>
            <CardDescription>
              Listed from the first failed attempt. Each retries on the 5, 20 and 60 minute
              schedule; after the last the player is told &ldquo;This morning&rsquo;s run
              didn&rsquo;t complete&rdquo;.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {h.failures.length === 0 ? (
              <Empty icon={<Cpu className="size-4" />} title="No failing runs">
                A run that fails even once shows here with its error and attempt count.
              </Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {h.failures.map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-col gap-2 rounded-lg p-3 shadow-[0_0_0_1px_var(--border)]"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{f.agent}</span>
                      <span className="text-muted-foreground">· {f.playerName}</span>
                      <Badge variant={f.exhausted ? 'danger' : 'warn'} className="ml-auto">
                        {f.exhausted
                          ? `Retries used · ${f.attempts} attempts`
                          : `Attempt ${f.attempts}`}
                      </Badge>
                    </div>
                    <code className="rounded bg-muted px-2 py-1 font-mono text-xs break-all">
                      {f.error}
                    </code>
                    <p className="text-xs text-muted-foreground">
                      First failed {dateTime(f.firstFailedAt)}
                      {f.playerToldAt ? ` · player told ${dateTime(f.playerToldAt)}` : ''}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <ConfirmAction
                        label="Retry"
                        title="Retry this run"
                        path={`/admin/runs/${f.id}/retry`}
                        consequence={`Re-queues ${f.playerName}'s ${f.agent} run now with the attempt count reset. Nothing is sent to the player unless it succeeds.`}
                        confirmLabel="Retry now"
                      />
                      <ConfirmAction
                        label="Dismiss"
                        title="Dismiss this failed run"
                        path={`/admin/runs/${f.id}/dismiss`}
                        consequence="Removes this failed run from the list without re-running it. The player keeps any notice they already had."
                        reasonRequired
                        variant="ghost"
                        confirmLabel="Dismiss"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Queues and runs per hour</CardTitle>
            <CardDescription>
              Work waiting on something outside the platform, and the last 24 hours of runs.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-muted p-3">
                <div className="text-xs text-muted-foreground">Transcription backlog</div>
                <div className="font-mono text-xl">
                  {h.queues.transcriptionBacklog}{' '}
                  <small className="text-sm text-muted-foreground">notes</small>
                </div>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <div className="text-xs text-muted-foreground">Open failures</div>
                <div className="font-mono text-xl">{h.failures.length}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Square-root scale, so the 07:00 batch doesn&rsquo;t hide the day
              </span>
              <Legend
                items={[
                  { label: 'Completed', color: 'var(--chart-3)' },
                  { label: 'Failed', color: 'var(--destructive)' },
                ]}
              />
            </div>
            <BarChart
              sqrt
              ariaLabel={`Agent runs per hour for the last 24 hours, ${h.runsPerHour.reduce((t, r) => t + r.completed, 0)} completed and ${h.runsPerHour.reduce((t, r) => t + r.failed, 0)} failed`}
              data={h.runsPerHour.map((r) => ({
                label: `${String(r.hour).padStart(2, '0')}:00`,
                value: r.completed,
                alt: r.failed,
              }))}
            />
          </CardContent>
        </Card>
      </Grid>

      {me.actingRole === 'owner' && h.providers ? (
        <Card>
          <CardHeader>
            <CardTitle>Providers and kill switches</CardTitle>
            <CardDescription>
              Turning a provider off pauses every agent that depends on it and shows players a plain
              notice. Nothing approved is undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {h.providers.map((p) => (
              <div
                key={p.key}
                className="grid grid-cols-[1fr_auto] items-start gap-3 rounded-lg p-3 shadow-[0_0_0_1px_var(--border)]"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {p.label}
                    {p.state === 'off' ? <Badge variant="danger">Off</Badge> : null}
                    {!p.wired ? <Badge variant="secondary">Not wired yet</Badge> : null}
                  </div>
                  <p className="text-[0.8125rem] text-muted-foreground">
                    {p.detail}
                    {p.dependents.length ? ` · affects ${p.dependents.join(', ')}` : ''}
                    {p.changedAt ? ` · changed ${dateTime(p.changedAt)}` : ''}
                  </p>
                </div>
                <KillSwitch
                  provider={p.key}
                  label={p.label}
                  state={p.state}
                  wired={p.wired}
                  dependents={p.dependents}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
