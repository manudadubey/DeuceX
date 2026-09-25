'use client';

import { cn } from '@deucex/ui';
import { Fab } from './fab';
import { Sidebar } from './sidebar';
import { TabBar } from './tab-bar';
import { Topbar } from './topbar';
import { useSidebarCollapsed } from './use-sidebar-collapsed';

export interface AppShellProps {
  email?: string | undefined;
  children: React.ReactNode;
}

// `.shell` (Baseline §Shells and routes): sidebar + topbar + content, with the mobile tab
// bar and FAB swapped in under 900px. See docs/DEUCEX-CONTEXT.md 4.2/4.3.
export function AppShell({ email, children }: AppShellProps) {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} email={email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onToggleSidebar={toggleCollapsed} />
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
      <Fab />
      <TabBar />
    </div>
  );
}
