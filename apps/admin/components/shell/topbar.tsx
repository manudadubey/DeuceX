'use client';

import { usePathname } from 'next/navigation';
import { PanelLeft } from 'lucide-react';
import { Badge, BadgeDot, Button, ThemeToggle, cn } from '@deucex/ui';
import { AlertsSheet } from './alerts-sheet';
import { formatDateChip } from './date-chip';
import { ROUTE_TITLES } from './nav';
import { PlayerSearch } from './player-search';

// Same `.topbar` recipe as the player app, with PRD-13 section 4.1's
// environment badge, global player search and Alerts bell.
export function Topbar({
  onToggleSidebar,
  environment,
  unreadAlerts,
}: {
  onToggleSidebar: () => void;
  environment: string;
  unreadAlerts: number;
}) {
  const pathname = usePathname() ?? '/';
  const base = `/${pathname.split('/')[1] ?? ''}`;
  const title = ROUTE_TITLES[pathname] ?? ROUTE_TITLES[base] ?? 'Console';

  return (
    <header
      className={cn(
        'sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border px-6',
        'bg-background/85 backdrop-blur-sm max-[900px]:gap-2 max-[900px]:px-4',
      )}
    >
      <Button
        variant="outline"
        size="icon"
        aria-label="Toggle sidebar"
        title="Toggle sidebar (⌘B)"
        onClick={onToggleSidebar}
        className="max-[900px]:hidden"
      >
        <PanelLeft aria-hidden="true" className="size-4" />
      </Button>
      <b className="text-sm font-medium text-foreground max-[900px]:text-base">{title}</b>
      <Badge variant="secondary" className="ml-2 max-[1100px]:hidden">
        {formatDateChip(new Date())}
      </Badge>
      <Badge variant="warn" className="max-[900px]:hidden">
        <BadgeDot />
        {environment}
      </Badge>
      <div className="ml-auto flex items-center gap-2">
        <PlayerSearch className="w-80 max-[1100px]:w-56 max-[900px]:hidden" />
        <AlertsSheet initialUnread={unreadAlerts} />
        <ThemeToggle />
      </div>
    </header>
  );
}
