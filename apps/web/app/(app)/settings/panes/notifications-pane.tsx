'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  FieldDescription,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from '@deucex/ui';
import {
  NOTIFICATION_AGENTS,
  hasAtLeastOneChannel,
  isNotificationChannelEnabled,
  updateNotificationPrefs,
  type NotificationAgent,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPrefs,
  type Player,
} from '@deucex/db';
import { createClient } from '@/lib/supabase/client';
import { pushState, turnOffPush, turnOnPush, type PushState } from '@/lib/push';

const AGENT_LABELS: Record<NotificationAgent, { label: string; forYou: string; fyi: string }> = {
  tournament: {
    label: 'Tournament Agent',
    forYou: 'Entry deadline in 3 days and 1 day · always at least one channel',
    fyi: 'Shortlist ready, outcomes logged',
  },
  content: {
    label: 'Content Agent',
    forYou: 'Draft ready to review',
    fyi: 'Sent, opens summary',
  },
  mindset: {
    label: 'Mindset Coach',
    forYou: "This morning's insight",
    fyi: 'Pattern noticed',
  },
  financial: {
    label: 'Financial Agent',
    forYou: 'Runway state changed',
    fyi: 'Reserves reminder, receivable pending',
  },
  fans: {
    label: 'Fans',
    forYou: 'Attention pass flagged a patron',
    fyi: 'Patron joined, payout sent (Fridays)',
  },
};

const CHANNELS: { key: NotificationChannel; label: string }[] = [
  { key: 'in_app', label: 'In app' },
  { key: 'email', label: 'Email' },
  { key: 'push', label: 'Push' },
];

// PRD-12 §4.5, ST-9/ST-10; decisions worksheet 13 (two categories, For you
// and FYI, per agent — not the finer per-event matrix). Quiet hours and the
// reserve reminder toggle close the follow-up step 2.1 and step 2.2's
// BUILD-LOG entries flagged by name.
export function NotificationsPane({
  player,
  onPlayerChange,
  onToast,
}: {
  player: Player;
  onPlayerChange: (patch: Partial<Player>) => void;
  onToast: (title: string) => void;
}) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(
    (player.notification_prefs as NotificationPrefs) ?? {},
  );
  const [quietStart, setQuietStart] = useState(player.quiet_hours_start.slice(0, 5));
  const [quietEnd, setQuietEnd] = useState(player.quiet_hours_end.slice(0, 5));
  const [reminderEnabled, setReminderEnabled] = useState(player.reserve_reminder_enabled);
  const [saving, setSaving] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    void pushState().then(setPush);
  }, []);

  // ST-9: entry deadlines (the Tournament Agent's For-you row) always keep
  // at least one channel, so Save stays off while that row has none.
  const guardrailBroken = !hasAtLeastOneChannel(prefs, 'tournament', 'for_you');

  async function handlePush(on: boolean) {
    setPushBusy(true);
    try {
      const supabase = createClient();
      const next = on ? await turnOnPush(supabase, player.id) : await turnOffPush(supabase);
      setPush(next);
      onToast(
        next === 'on'
          ? 'Push is on for this device'
          : next === 'blocked'
            ? 'Notifications are blocked for this site in your browser settings'
            : 'Push is off for this device',
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Push could not be changed');
    } finally {
      setPushBusy(false);
    }
  }

  function toggle(
    agent: NotificationAgent,
    category: NotificationCategory,
    channel: NotificationChannel,
  ) {
    setPrefs((prev) => {
      const current = isNotificationChannelEnabled(prev, agent, category, channel);
      return {
        ...prev,
        [agent]: {
          ...prev[agent],
          [category]: { ...prev[agent]?.[category], [channel]: !current },
        },
      };
    });
  }

  async function handleSave() {
    if (guardrailBroken) return;
    setSaving(true);
    try {
      const supabase = createClient();
      await updateNotificationPrefs(supabase, {
        playerId: player.id,
        notificationPrefs: prefs,
        quietHoursStart: quietStart,
        quietHoursEnd: quietEnd,
        reserveReminderEnabled: reminderEnabled,
      });
      onPlayerChange({
        notification_prefs: prefs,
        quiet_hours_start: quietStart,
        quiet_hours_end: quietEnd,
        reserve_reminder_enabled: reminderEnabled,
      });
      onToast('Saved');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="gap-6 p-6">
      <CardHeader className="p-0">
        <CardTitle>Notifications</CardTitle>
      </CardHeader>

      <TableWrap>
        <Table id="notif">
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              {CHANNELS.map((c) => (
                <TableHead key={c.key} numeric>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {NOTIFICATION_AGENTS.map((agent) =>
              (['for_you', 'fyi'] as const).map((category) => {
                const rowGuardrailBroken =
                  agent === 'tournament' &&
                  category === 'for_you' &&
                  !hasAtLeastOneChannel(prefs, agent, category);
                return (
                  <TableRow key={`${agent}-${category}`}>
                    <TableCell>
                      <div className="font-medium">
                        {AGENT_LABELS[agent].label} · {category === 'for_you' ? 'For you' : 'FYI'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {category === 'for_you'
                          ? AGENT_LABELS[agent].forYou
                          : AGENT_LABELS[agent].fyi}
                      </div>
                      {rowGuardrailBroken && (
                        <div className="text-xs text-destructive">
                          Keep at least one channel on.
                        </div>
                      )}
                    </TableCell>
                    {CHANNELS.map((c) => (
                      <TableCell key={c.key} numeric>
                        <Switch
                          checked={isNotificationChannelEnabled(prefs, agent, category, c.key)}
                          onCheckedChange={() => toggle(agent, category, c.key)}
                          aria-label={`${AGENT_LABELS[agent].label} ${category} ${c.label}`}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                );
              }),
            )}
          </TableBody>
        </Table>
      </TableWrap>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Quiet hours</span>
          <input
            type="time"
            value={quietStart}
            onChange={(e) => setQuietStart(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="time"
            value={quietEnd}
            onChange={(e) => setQuietEnd(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
        <FieldDescription>
          Only entry deadlines under 24 hours break through. Everything else is held until quiet
          hours end.
        </FieldDescription>
        <FieldDescription>
          After five FYI emails in a week, the rest arrive together in one digest on Monday morning.
          For-you emails always arrive on their own.
        </FieldDescription>

        <div className="flex items-center gap-3">
          <Switch
            checked={reminderEnabled}
            onCheckedChange={setReminderEnabled}
            aria-label="Sunday reserve-balance reminder"
          />
          <span className="text-sm">Sunday reserve-balance reminder</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <Switch
            checked={push === 'on'}
            disabled={
              pushBusy || push === null || push === 'unsupported' || push === 'unconfigured'
            }
            onCheckedChange={(v) => void handlePush(v)}
            aria-label="Push notifications on this device"
          />
          <span className="text-sm font-medium">Push on this device</span>
        </div>
        <FieldDescription>
          {push === 'unsupported'
            ? 'This browser cannot receive push. On iPhone, add DeuceX to your Home Screen first.'
            : push === 'unconfigured'
              ? 'Push is not set up in this environment yet.'
              : push === 'blocked'
                ? 'Notifications are blocked for this site. Allow them in your browser settings, then try again.'
                : 'The Push column above decides what arrives. Turn it on for each phone or computer you use.'}
        </FieldDescription>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button onClick={handleSave} disabled={saving || guardrailBroken}>
          Save
        </Button>
        {guardrailBroken ? (
          <span className="text-xs text-destructive">
            Entry deadlines need at least one channel on.
          </span>
        ) : null}
      </div>
    </Card>
  );
}
