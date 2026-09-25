'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  Bell,
  Brain,
  CircleAlert,
  PenLine,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Empty,
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from '@deucex/ui';
import { showsInApp, type NotificationPrefs } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';

// `#nt` (Baseline §Feedback and overlays; PRD-00 M-NOTIF-1; decisions
// worksheet 13): one rail with two categories, For you (a decision, or the
// player's money or entries) and FYI. Rows come straight from the player's
// own notifications (RLS: select and update `read` on their own rows only),
// filtered by their In app switches in Settings > Notifications. Email and
// push are delivered separately by apps/api (step 5.2).

interface Row {
  id: string;
  agent: string;
  category: 'for_you' | 'fyi';
  title: string;
  body: string;
  action_href: string | null;
  read: boolean;
  created_at: string;
}

const AGENTS: Record<string, { label: string; icon: LucideIcon }> = {
  tournament: { label: 'Tournament Agent', icon: Trophy },
  conditions: { label: 'Conditions', icon: Trophy },
  content: { label: 'Content Agent', icon: PenLine },
  'mindset-coach': { label: 'Mindset Coach', icon: Brain },
  financial: { label: 'Financial Agent', icon: Banknote },
  fans: { label: 'Fans', icon: Users },
  stripe: { label: 'Fans', icon: Users },
};
const PLATFORM = { label: 'DeuceX', icon: CircleAlert };

function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = Math.round(
    (new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000,
  );
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

export function NotificationSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'for_you' | 'fyi'>('for_you');
  const [rows, setRows] = useState<Row[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs>({});
  const [quiet, setQuiet] = useState<{ start: string; end: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const id = auth.user?.id;
    if (!id) return;
    const [{ data: list }, { data: player }] = await Promise.all([
      supabase
        .from('notifications')
        .select('id, agent, category, title, body, action_href, read, created_at')
        .order('created_at', { ascending: false })
        .limit(60),
      supabase
        .from('players')
        .select('notification_prefs, quiet_hours_start, quiet_hours_end')
        .eq('id', id)
        .maybeSingle(),
    ]);
    setRows((list ?? []) as Row[]);
    setPrefs((player?.notification_prefs ?? {}) as NotificationPrefs);
    if (player)
      setQuiet({
        start: player.quiet_hours_start.slice(0, 5),
        end: player.quiet_hours_end.slice(0, 5),
      });
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const visible = useMemo(() => rows.filter((r) => showsInApp(r, prefs)), [rows, prefs]);
  const unreadForYou = visible.filter((r) => r.category === 'for_you' && !r.read).length;
  const unread = visible.filter((r) => !r.read).length;
  const list = visible.filter((r) => r.category === tab);
  const now = new Date();
  const days = [...new Set(list.map((r) => dayLabel(r.created_at, now)))];

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    setRows((current) => current.map((r) => (ids.includes(r.id) ? { ...r, read: true } : r)));
    await createClient().from('notifications').update({ read: true }).in('id', ids);
  }

  async function openRow(row: Row) {
    await markRead(row.read ? [] : [row.id]);
    if (row.action_href) {
      setOpen(false);
      router.push(row.action_href);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative"
        >
          <Bell aria-hidden="true" className="size-4" />
          {unread ? (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-chart-2 px-1 text-[0.625rem] font-semibold text-background"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="flex-row items-center gap-2.5 px-5 pt-4 pb-3">
          <div className="flex-1">
            <SheetTitle>Notifications</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {unreadForYou ? `${unreadForYou} need you` : 'Nothing needs you'}
            </SheetDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={!unread}
            onClick={() => void markRead(visible.filter((r) => !r.read).map((r) => r.id))}
          >
            Mark all read
          </Button>
          <SheetCloseButton />
        </SheetHeader>
        <div className="px-5 pb-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'for_you' | 'fyi')}>
            <TabsList aria-label="Filter notifications">
              <TabsTrigger value="for_you">
                For you
                {unreadForYou ? <span className="ml-1.5 text-xs">{unreadForYou}</span> : null}
              </TabsTrigger>
              <TabsTrigger value="fyi">FYI</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
          {loaded && list.length === 0 ? (
            <Empty title={tab === 'for_you' ? 'Nothing needs you' : 'No updates yet'}>
              {tab === 'for_you'
                ? 'Decisions, money and entries land here.'
                : 'Agents post what they did here once there is something to see.'}
            </Empty>
          ) : null}
          {days.map((day) => (
            <div key={day} className="flex flex-col gap-1">
              <div className="px-2 pt-3.5 pb-1.5 text-[0.6875rem] font-medium tracking-[.06em] text-muted-foreground uppercase">
                {day}
              </div>
              {list
                .filter((r) => dayLabel(r.created_at, now) === day)
                .map((r) => {
                  const agent = AGENTS[r.agent] ?? PLATFORM;
                  const Icon = agent.icon;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => void openRow(r)}
                      className="relative grid w-full grid-cols-[2rem_1fr_auto] items-start gap-x-3 gap-y-0.5 rounded-lg p-3 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none max-[900px]:min-h-11"
                    >
                      {!r.read ? (
                        <span
                          aria-label="Unread"
                          className="absolute top-1/2 left-1 size-1.5 -translate-y-1/2 rounded-full bg-chart-2"
                        />
                      ) : null}
                      <span
                        aria-hidden="true"
                        className={cn(
                          'row-span-3 grid size-8 place-items-center rounded-md bg-muted',
                          r.category === 'for_you' && !r.read && 'bg-warn-bg text-warn',
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="text-xs text-muted-foreground">{agent.label}</span>
                      <span className="font-mono text-[0.6875rem] whitespace-nowrap text-muted-foreground">
                        {timeLabel(r.created_at)}
                      </span>
                      <span
                        className={cn(
                          'col-start-2 text-sm leading-snug',
                          r.read ? 'font-normal' : 'font-medium',
                        )}
                      >
                        {r.title}
                      </span>
                      <span className="col-start-2 text-[0.8125rem] leading-normal text-muted-foreground">
                        {r.body}
                      </span>
                      {r.action_href ? (
                        <Badge
                          variant={r.category === 'for_you' ? 'lime' : 'secondary'}
                          className="col-start-3 row-start-2 row-span-2 self-end"
                        >
                          Open
                        </Badge>
                      ) : null}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-[0.8125rem] text-muted-foreground">
          <span>
            {quiet ? `Quiet hours ${quiet.start}–${quiet.end} · deadlines break through` : ''}
          </span>
          <Link
            href="/settings?pane=notifications"
            onClick={() => setOpen(false)}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Preferences
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
