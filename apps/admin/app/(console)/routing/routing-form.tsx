'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@deucex/ui';
import type { RoutingRow } from '@/lib/api';
import { browserApi } from '@/lib/browser-api';

const ROLES = ['support', 'ops', 'owner'] as const;

export function RoutingForm({ rows }: { rows: RoutingRow[] }) {
  const router = useRouter();
  const [state, setState] = useState(rows);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(kind: string, role: string, channel: 'push' | 'email') {
    setState((current) =>
      current.map((r) =>
        r.kind !== kind
          ? r
          : {
              ...r,
              routes: r.routes.map((x) => (x.role === role ? { ...x, [channel]: !x[channel] } : x)),
            },
      ),
    );
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await browserApi('/admin/routing', {
        method: 'PUT',
        body: JSON.stringify({
          routes: state.flatMap((r) =>
            r.routes.map((x) => ({
              role: x.role,
              alertKind: r.kind,
              push: x.push,
              email: x.email,
            })),
          ),
        }),
      });
      setMessage('Routing saved and logged.');
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const section = (category: 'act' | 'fyi', title: string, description: string) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alert</TableHead>
              {ROLES.map((role) => (
                <TableHead key={role} className="text-center capitalize">
                  {role}
                  <span className="block text-[0.6875rem]">push · email</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {state
              .filter((r) => r.category === category)
              .map((r) => (
                <TableRow key={r.kind}>
                  <TableCell>
                    {r.label}
                    <span className="block text-xs text-muted-foreground capitalize">
                      Owned by {r.owner}
                    </span>
                  </TableCell>
                  {r.routes.map((x) => (
                    <TableCell key={x.role} className="text-center">
                      <span className="inline-flex items-center gap-2">
                        <Switch
                          checked={x.push}
                          onCheckedChange={() => toggle(r.kind, x.role, 'push')}
                          aria-label={`${r.label}: push to ${x.role}`}
                        />
                        <Switch
                          checked={x.email}
                          onCheckedChange={() => toggle(r.kind, x.role, 'email')}
                          aria-label={`${r.label}: email to ${x.role}`}
                        />
                      </span>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <>
      {section('act', 'Needs action', 'In the console always; push and email per role.')}
      {section('fyi', 'FYI', 'Collapsed into one daily email per role unless push is chosen.')}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy}>
          Save routing
        </Button>
        {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
      </div>
    </>
  );
}
