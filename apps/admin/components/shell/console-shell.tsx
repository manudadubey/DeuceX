'use client';

import type { AdminArea, AdminRole } from '@deucex/shared';
import { cn } from '@deucex/ui';
import { Sidebar, type SidebarProps } from './sidebar';
import { TabBar } from './tab-bar';
import { Topbar } from './topbar';
import { useSidebarCollapsed } from './use-sidebar-collapsed';

export interface ConsoleShellProps {
  me: { name: string; email: string; role: AdminRole; actingRole: AdminRole };
  areas: readonly AdminArea[];
  counts: SidebarProps['counts'];
  environment: string;
  unreadAlerts: number;
  children: React.ReactNode;
}

// The player app's `.shell` (apps/web/components/shell/app-shell.tsx):
// sidebar, topbar and content, with the tab bar under 900px. PRD-13
// section 4.1: "Same shell as the player product."
export function ConsoleShell({
  me,
  areas,
  counts,
  environment,
  unreadAlerts,
  children,
}: ConsoleShellProps) {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} areas={areas} counts={counts} me={me} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onToggleSidebar={toggleCollapsed}
          environment={environment}
          unreadAlerts={unreadAlerts}
        />
        <main
          className={cn(
            'mx-auto flex w-full flex-col gap-6 p-6 transition-[max-width] duration-200',
            'max-[900px]:max-w-none max-[900px]:gap-4 max-[900px]:p-4',
            'max-[900px]:pb-[calc(6rem+env(safe-area-inset-bottom))]',
            collapsed ? 'max-w-[100rem]' : 'max-w-[87.5rem]',
          )}
        >
          {children}
        </main>
      </div>
      <TabBar areas={areas} />
    </div>
  );
}
