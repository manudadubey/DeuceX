'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo, cn } from '@procircuit/ui';
import { NAV_GROUPS } from './routes';

export interface SidebarProps {
  collapsed: boolean;
  email?: string | undefined;
}

// `.sidebar` (Baseline §Shells and routes): 256px, 48px collapsed, hidden entirely under
// 900px in favour of the mobile tab bar (see tab-bar.tsx).
export function Sidebar({ collapsed, email }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen shrink-0 flex-col gap-2 border-r border-sidebar-border',
        'bg-sidebar p-2 text-sidebar-foreground transition-[width] duration-200 max-[900px]:hidden',
        collapsed ? 'w-12' : 'w-64',
      )}
    >
      <div className={cn('flex items-center gap-2.5 p-2', collapsed && 'justify-center')}>
        <Logo />
        {!collapsed ? (
          <div className="leading-tight">
            <div className="text-sm font-medium">ProCircuit</div>
          </div>
        ) : null}
      </div>

      <nav aria-label="Primary" className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="p-2">
            {!collapsed ? (
              <div className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">
                {group.label}
              </div>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground no-underline',
                        'hover:bg-sidebar-accent',
                        active && 'bg-sidebar-accent font-medium',
                        collapsed && 'mx-auto w-8 justify-center px-0',
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          'size-4 shrink-0 text-muted-foreground',
                          active && 'text-sidebar-foreground',
                        )}
                      />
                      {!collapsed ? item.label : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-auto p-2">
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-md p-2',
            collapsed && 'justify-center px-0',
          )}
        >
          <div
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-md bg-chart-2 text-xs font-semibold text-[oklch(0.2_0.05_131)]"
          >
            {(email?.[0] ?? '?').toUpperCase()}
          </div>
          {!collapsed ? (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium">{email ?? 'Signed in'}</div>
            </div>
          ) : null}
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            title="Sign out"
            className={cn(
              'flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-destructive',
              'hover:bg-sidebar-accent',
              collapsed && 'justify-center px-0',
            )}
          >
            {!collapsed ? 'Sign out' : '⏻'}
          </button>
        </form>
      </div>
    </aside>
  );
}
