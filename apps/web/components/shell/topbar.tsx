'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { CircleHelp, PanelLeft, Share2 } from 'lucide-react';
import {
  Badge,
  Button,
  ThemeToggle,
  Toast,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  cn,
} from '@procircuit/ui';
import { createShareLink, listShareLinks } from '@procircuit/db';
import { createClient } from '@/lib/supabase/client';
import { formatDateChip } from './date-chip';
import { NotificationSheet } from './notification-sheet';
import { ROUTE_TITLES } from './routes';

export interface TopbarProps {
  onToggleSidebar: () => void;
}

// `.topbar` (Baseline §Shells and routes): sticky, translucent, title + date chip on the
// left, share / tour / bell / theme on the right. The tour walkthrough doesn't exist yet
// (no onboarded walkthrough content), so it stays disabled. "Share with coach" is real as
// of step 2.3 (PRD-12 §4.9): finds the player's active coach link or creates one, copies
// it, no navigation to Settings required for the common case.
export function Topbar({ onToggleSidebar }: TopbarProps) {
  const pathname = usePathname();
  const title = ROUTE_TITLES[pathname ?? ''] ?? 'Dashboard';
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);

  async function handleShare() {
    setSharing(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const playerId = data.user?.id;
      if (!playerId) return;

      const links = await listShareLinks(supabase, playerId);
      let link = links.find(
        (l) => l.scope === 'coach' && !l.revoked && new Date(l.expires_at).getTime() > Date.now(),
      );
      if (!link) link = await createShareLink(supabase, { playerId, scope: 'coach' });

      await navigator.clipboard.writeText(`${window.location.origin}/coach/${link.token}`);
      setToast('Coach link copied');
      setToastOpen(true);
    } finally {
      setSharing(false);
    }
  }

  return (
    <ToastProvider>
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
          <Button variant="outline" size="sm" disabled={sharing} onClick={handleShare}>
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
        {toast && (
          <Toast open={toastOpen} onOpenChange={setToastOpen}>
            <ToastTitle className="font-medium">{toast}</ToastTitle>
          </Toast>
        )}
        <ToastViewport />
      </header>
    </ToastProvider>
  );
}
