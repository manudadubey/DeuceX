'use client';

import { usePathname } from 'next/navigation';
import { CircleHelp, PanelLeft, Share2 } from 'lucide-react';
import { Badge, Button, ThemeToggle, cn } from '@procircuit/ui';
import { formatDateChip } from './date-chip';
import { NotificationSheet } from './notification-sheet';
import { ROUTE_TITLES } from './routes';

export interface TopbarProps {
  onToggleSidebar: () => void;
}

// `.topbar` (Baseline §Shells and routes): sticky, translucent, title + date chip on the
// left, share / tour / bell / theme on the right. Share and the tour walkthrough don't
// exist yet (no coach-share flow, no onboarded walkthrough content), so those two stay
// disabled rather than faking a working control.
export function Topbar({ onToggleSidebar }: TopbarProps) {
  const pathname = usePathname();
  const title = ROUTE_TITLES[pathname ?? ''] ?? 'Dashboard';

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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <b className="font-medium text-foreground max-[900px]:text-base">{title}</b>
      </div>
      <Badge variant="secondary" className="ml-2 max-[900px]:hidden">
        {formatDateChip(new Date())}
      </Badge>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" disabled title="Coming soon">
          <Share2 aria-hidden="true" className="size-4" />
          <span className="max-[900px]:hidden">Share with coach</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled
          title="Coming soon"
          aria-label="Take the tour"
        >
          <CircleHelp aria-hidden="true" className="size-4" />
        </Button>
        <NotificationSheet />
        <ThemeToggle />
      </div>
    </header>
  );
}
