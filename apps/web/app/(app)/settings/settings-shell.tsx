'use client';

import { useCallback, useState } from 'react';
import { Toast, ToastProvider, ToastTitle, ToastViewport, cn } from '@procircuit/ui';
import type { Player } from '@procircuit/db';
import type { Database } from '@procircuit/db';
import { AccountPane } from './panes/account-pane';
import { PreferencesPane } from './panes/preferences-pane';
import { BillingPane } from './panes/billing-pane';
import { NotificationsPane } from './panes/notifications-pane';
import { AgentsPane } from './panes/agents-pane';
import { EquipmentPane } from './panes/equipment-pane';
import { ConnectionsPane } from './panes/connections-pane';
import { SharingPane } from './panes/sharing-pane';
import { DataSafetyPane } from './panes/data-safety-pane';

type AgentSchedule = Database['public']['Tables']['agent_schedules']['Row'];
type ShareLink = Database['public']['Tables']['share_links']['Row'];

// The nine panes, in PRD-12 §4's own order (#stNav). All nine always render
// real UI (M-TIER-1) — a pane with nothing live behind it yet (Equipment,
// most of Connections) says so plainly rather than showing a blank or
// locked state.
const PANES = [
  { key: 'account', label: 'Account' },
  { key: 'prefs', label: 'Preferences' },
  { key: 'billing', label: 'Plan & billing' },
  { key: 'notif', label: 'Notifications' },
  { key: 'agents', label: 'Agents' },
  { key: 'equip', label: 'Equipment' },
  { key: 'conn', label: 'Connections' },
  { key: 'share', label: 'Sharing' },
  { key: 'data', label: 'Data & safety' },
] as const;

type PaneKey = (typeof PANES)[number]['key'];

export function SettingsShell({
  player: initialPlayer,
  agentSchedules: initialAgentSchedules,
  shareLinks: initialShareLinks,
}: {
  player: Player;
  agentSchedules: AgentSchedule[];
  shareLinks: ShareLink[];
}) {
  const [pane, setPane] = useState<PaneKey>('account');
  const [player, setPlayer] = useState<Player>(initialPlayer);
  const [agentSchedules, setAgentSchedules] = useState<AgentSchedule[]>(initialAgentSchedules);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>(initialShareLinks);
  const [toast, setToast] = useState<{ title: string } | null>(null);
  const [toastOpen, setToastOpen] = useState(false);

  const showToast = useCallback((title: string) => {
    setToast({ title });
    setToastOpen(true);
  }, []);

  const onPlayerChange = useCallback((patch: Partial<Player>) => {
    setPlayer((prev) => ({ ...prev, ...patch }));
  }, []);

  return (
    <ToastProvider>
      <div className="grid grid-cols-[200px_1fr] gap-6 max-[720px]:grid-cols-1">
        <nav aria-label="Settings" className="flex flex-col gap-0.5" id="stNav">
          {PANES.map((p) => (
            <button
              key={p.key}
              type="button"
              data-st={p.key}
              aria-current={pane === p.key ? 'page' : undefined}
              onClick={() => setPane(p.key)}
              className={cn(
                'rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                pane === p.key
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </nav>

        <div data-st-pane={pane} className="flex flex-col gap-6">
          {pane === 'account' && (
            <AccountPane player={player} onPlayerChange={onPlayerChange} onToast={showToast} />
          )}
          {pane === 'prefs' && (
            <PreferencesPane player={player} onPlayerChange={onPlayerChange} onToast={showToast} />
          )}
          {pane === 'billing' && (
            <BillingPane player={player} onPlayerChange={onPlayerChange} onToast={showToast} />
          )}
          {pane === 'notif' && (
            <NotificationsPane
              player={player}
              onPlayerChange={onPlayerChange}
              onToast={showToast}
            />
          )}
          {pane === 'agents' && (
            <AgentsPane
              playerId={player.id}
              agentSchedules={agentSchedules}
              onAgentSchedulesChange={setAgentSchedules}
              onToast={showToast}
            />
          )}
          {pane === 'equip' && (
            <EquipmentPane
              playerId={player.id}
              initialUnits={player.units === 'imperial' ? 'imperial' : 'metric'}
              onUnitsChange={(units) => onPlayerChange({ units })}
              onToast={showToast}
            />
          )}
          {pane === 'conn' && <ConnectionsPane playerId={player.id} />}
          {pane === 'share' && (
            <SharingPane
              playerId={player.id}
              shareLinks={shareLinks}
              onShareLinksChange={setShareLinks}
              onToast={showToast}
            />
          )}
          {pane === 'data' && (
            <DataSafetyPane player={player} onPlayerChange={onPlayerChange} onToast={showToast} />
          )}
        </div>
      </div>

      {toast && (
        <Toast open={toastOpen} onOpenChange={setToastOpen}>
          <ToastTitle className="font-medium">{toast.title}</ToastTitle>
        </Toast>
      )}
      <ToastViewport />
    </ToastProvider>
  );
}
