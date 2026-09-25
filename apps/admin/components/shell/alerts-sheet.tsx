'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, Info } from 'lucide-react';
import {
  Button,
  Empty,
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from '@deucex/ui';
import type { Alert } from '@/lib/api';
import { browserApi, post } from '@/lib/browser-api';

type Filter = 'all' | 'act' | 'fyi';

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
}

// `#nt` (PRD-13 section 4.8): platform alerts grouped by day, All / Needs
// action / FYI, Mark all read. Same Sheet the player notification rail uses.
export function AlertsSheet({ initialUnread }: { initialUnread: number }) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [unread, setUnread] = useState(initialUnread);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const list = await browserApi<Alert[]>('/admin/alerts');
      setAlerts(list);
      setUnread(list.filter((a) => a.category === 'act' && !a.acknowledgedAt).length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const shown = useMemo(
    () => (alerts ?? []).filter((a) => filter === 'all' || a.category === filter),
    [alerts, filter],
  );

  async function markAllRead() {
    await post('/admin/alerts/ack', { all: true });
    await load();
  }

  let lastDay = '';
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={unread ? `Alerts, ${unread} need action` : 'Alerts'}
          title="Alerts from the platform: failed runs, stale feeds, cases waiting"
          className="relative"
        >
          <Bell aria-hidden="true" className="size-4" />
          {unread > 0 ? (
            <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 font-mono text-[0.625rem] text-white">
              {unread}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Alerts</SheetTitle>
          <SheetCloseButton />
        </SheetHeader>
        <SheetDescription className="px-4 text-sm text-muted-foreground">
          {unread ? `${unread} need action` : 'Nothing waiting'}
        </SheetDescription>
        <div className="flex items-center gap-2 px-4 py-3">
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && setFilter(v as Filter)}
            aria-label="Filter alerts"
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="act">Needs action</ToggleGroupItem>
            <ToggleGroupItem value="fyi">FYI</ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={markAllRead}
            disabled={!unread}
          >
            Mark all read
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : alerts === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : shown.length === 0 ? (
            <Empty title="No alerts">
              Failed runs, stale feeds, new cases and money alerts land here as they happen.
            </Empty>
          ) : (
            <ul className="flex flex-col gap-1">
              {shown.map((a) => {
                const day = dayLabel(a.createdAt);
                const header = day !== lastDay ? day : null;
                lastDay = day;
                const read = a.category === 'fyi' || a.acknowledgedAt !== null;
                return (
                  <li key={a.id}>
                    {header ? (
                      <div className="pt-3 pb-1 text-xs font-medium text-muted-foreground">
                        {header}
                      </div>
                    ) : null}
                    <Link
                      href={a.link ?? '/'}
                      className={cn(
                        'grid grid-cols-[1.75rem_1fr_auto] gap-x-2 rounded-md p-2 text-sm no-underline hover:bg-accent',
                        read && 'opacity-70',
                      )}
                    >
                      <span
                        className={cn(
                          'row-span-2 grid size-7 place-items-center rounded-md',
                          a.category === 'act'
                            ? 'bg-warn-bg text-warn'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {a.category === 'act' ? (
                          <AlertTriangle aria-hidden="true" className="size-3.5" />
                        ) : (
                          <Info aria-hidden="true" className="size-3.5" />
                        )}
                      </span>
                      <span className="font-medium text-foreground">{a.title}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {new Date(a.createdAt).toLocaleTimeString('en-AU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="col-span-2 text-muted-foreground">{a.body}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
