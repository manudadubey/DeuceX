import Link from 'next/link';
import {
  Badge,
  Card,
  CardContent,
  Empty,
  Table,
  TableBody,
  TableCell,
  TableCellSub,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@deucex/ui';
import { actionLabel, dateTime } from '@/components/format';
import { PageHeader } from '@/components/page';
import type { AdminAudit } from '@/lib/api';
import { requireArea, serverApi } from '@/lib/server-api';

// AD-28: everything done under your name; the owner can see every admin's.
export default async function AuditPage({ searchParams }: { searchParams: { admin?: string } }) {
  const me = await requireArea('audit');
  const admin = searchParams.admin;
  const log = await serverApi<AdminAudit>(`/admin/audit${admin ? `?admin=${admin}` : ''}`);
  const owner = me.actingRole === 'owner';

  return (
    <>
      <PageHeader
        title={owner ? 'Admin audit log' : 'My admin audit log'}
        description="Everything done from this console, newest first. Players see the same entries, marked as admin actions, in their own Data and safety log. Entries are append-only and cannot be edited or deleted."
      />
      <Card>
        <CardContent className="flex flex-col gap-3">
          {owner && log.admins.length ? (
            <div className="flex flex-wrap gap-2 text-sm">
              <Link
                href="/audit"
                className={cn(
                  'rounded-md px-2 py-1 no-underline',
                  !admin ? 'bg-accent font-medium' : 'text-muted-foreground',
                )}
              >
                All admins
              </Link>
              {log.admins.map((a) => (
                <Link
                  key={a.id}
                  href={`/audit?admin=${a.id}`}
                  className={cn(
                    'rounded-md px-2 py-1 no-underline',
                    admin === a.id ? 'bg-accent font-medium' : 'text-muted-foreground',
                  )}
                >
                  {a.name} ({a.role})
                </Link>
              ))}
            </div>
          ) : null}
          {log.entries.length === 0 ? (
            <Empty title="No admin actions yet">
              Every confirmed console action is recorded here with its reason.
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="max-[900px]:hidden">Consequence shown</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {dateTime(e.at)}
                    </TableCell>
                    <TableCell>
                      {e.adminName}
                      <TableCellSub>
                        <Badge variant="secondary" className="capitalize">
                          {e.role}
                        </Badge>
                      </TableCellSub>
                    </TableCell>
                    <TableCell>
                      {actionLabel(e.action)}
                      {e.playerName ? <TableCellSub>{e.playerName}</TableCellSub> : null}
                    </TableCell>
                    <TableCell className="max-w-md text-[0.8125rem] text-muted-foreground max-[900px]:hidden">
                      {e.consequence}
                    </TableCell>
                    <TableCell className="text-[0.8125rem]">{e.reason ?? '–'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="text-xs text-muted-foreground">{log.entries.length} entries shown</p>
        </CardContent>
      </Card>
    </>
  );
}
