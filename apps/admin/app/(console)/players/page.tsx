import Link from 'next/link';
import {
  Badge,
  Card,
  CardContent,
  Empty,
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
  cn,
} from '@deucex/ui';
import { relative } from '@/components/format';
import { PageHeader } from '@/components/page';
import type { PlayerDetail, PlayersResponse } from '@/lib/api';
import { requireArea, serverApi } from '@/lib/server-api';
import { PlayerFilters } from './filters';
import { PlayerPanel } from './player-panel';
import { STATUS_BADGE } from './status';

const STAGE_LABEL: Record<string, string> = {
  '1': 'Building',
  '2': 'Emerging',
  '3': 'Established',
};

function tierLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

// PRD-13 section 4.3.
export default async function PlayersPage({
  searchParams,
}: {
  searchParams: { q?: string; tier?: string; status?: string; id?: string };
}) {
  const me = await requireArea('players');
  const q = searchParams.q ?? '';
  const tier = searchParams.tier ?? '';
  const status = searchParams.status ?? '';
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (tier) params.set('tier', tier);
  if (status) params.set('status', status);

  const { stats, players } = await serverApi<PlayersResponse>(`/admin/players?${params}`);
  const selectedId = searchParams.id ?? players[0]?.id ?? null;
  const detail = selectedId ? await serverApi<PlayerDetail>(`/admin/players/${selectedId}`) : null;

  const linkFor = (id: string) => {
    const p = new URLSearchParams(params);
    p.set('id', id);
    return `/players?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Players"
        description="Every account, what they pay for, and the actions support can take. Notes, transcripts, moods and audio are never shown here."
      />

      <StatsRow>
        <Stat>
          <StatLabel>Signed up</StatLabel>
          <StatValue>{stats.total}</StatValue>
          <StatSub>
            {stats.free} Free · {stats.pro} Pro · {stats.elite} Elite · {stats.dormant} dormant ·{' '}
            {stats.atp} ATP · {stats.wta} WTA
          </StatSub>
        </Stat>
        <Stat>
          <StatLabel>By stage</StatLabel>
          <StatValue>
            {stats.stage1}{' '}
            <small>
              · {stats.stage2} · {stats.stage3}
            </small>
          </StatValue>
          <StatSub>Building · Emerging · Established</StatSub>
        </Stat>
        <Stat>
          <StatLabel>Unverified</StatLabel>
          <StatValue className={cn(stats.unverified > 0 && 'text-warn')}>
            {stats.unverified}
          </StatValue>
          <StatSub>{stats.ambiguous} ambiguous matches waiting on the player</StatSub>
        </Stat>
        <Stat>
          <StatLabel>Under 18</StatLabel>
          <StatValue>{stats.minors}</StatValue>
          <StatSub>
            {stats.minors_confirmed} guardian-linked
            {stats.minors - stats.minors_confirmed > 0 ? (
              <span className="text-warn">
                {' '}
                · {stats.minors - stats.minors_confirmed} not yet confirmed
              </span>
            ) : null}
          </StatSub>
        </Stat>
      </StatsRow>

      <div className="grid grid-cols-[minmax(0,1fr)_24rem] items-start gap-4 max-[1100px]:grid-cols-1">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <PlayerFilters q={q} tier={tier} status={status} />
            {players.length === 0 ? (
              <Empty title="No players match">Try a name, email, country or ranking number.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead className="max-[900px]:hidden">Ranking</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead numeric className="max-[900px]:hidden">
                      Patrons
                    </TableHead>
                    <TableHead className="max-[900px]:hidden">Last active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {players.map((p) => (
                    <TableRow key={p.id} className={cn(p.id === selectedId && 'bg-accent')}>
                      <TableCell>
                        <Link
                          href={linkFor(p.id)}
                          className="font-medium text-foreground no-underline hover:underline"
                        >
                          {p.name}
                        </Link>
                        <TableCellSub>
                          {p.email} · {p.country}
                        </TableCellSub>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-[900px]:hidden">
                        {p.ranking ?? '–'}
                      </TableCell>
                      <TableCell>
                        {p.stage ? (
                          <Badge variant="secondary">{STAGE_LABEL[p.stage] ?? p.stage}</Badge>
                        ) : (
                          '–'
                        )}
                      </TableCell>
                      <TableCell>{tierLabel(p.tier)}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE[p.status]}>{p.status}</Badge>
                      </TableCell>
                      <TableCell numeric className="max-[900px]:hidden">
                        {p.patrons}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-[900px]:hidden">
                        {relative(p.lastActiveAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="text-xs text-muted-foreground">
              Showing {players.length} of {stats.total} · newest sign-ups first
            </p>
          </CardContent>
        </Card>

        {detail ? <PlayerPanel player={detail} role={me.actingRole} /> : null}
      </div>
    </>
  );
}
