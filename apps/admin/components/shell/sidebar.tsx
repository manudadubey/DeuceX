'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import type { AdminArea, AdminRole } from '@deucex/shared';
import { Badge, Logo, cn } from '@deucex/ui';
import { CONSOLE_NAV, ELSEWHERE_NAV, isActive } from './nav';
import { UserMenu } from './user-menu';

export interface SidebarProps {
  collapsed: boolean;
  areas: readonly AdminArea[];
  counts: Partial<Record<AdminArea, { value: number; tone: 'warn' | 'danger' | 'secondary' }>>;
  me: { name: string; email: string; role: AdminRole; actingRole: AdminRole };
}

// Same `.sidebar` recipe as the player app (apps/web/components/shell/
// sidebar.tsx): 256px, 48px collapsed, hidden under 900px for the tab bar.
export function Sidebar({ collapsed, areas, counts, me }: SidebarProps) {
  const pathname = usePathname() ?? '/';
  const items = CONSOLE_NAV.filter((item) => areas.includes(item.area));

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
            <div className="text-sm font-medium">DeuceX Admin</div>
            <div className="text-xs text-muted-foreground">Operations console</div>
          </div>
        ) : null}
      </div>

      <nav aria-label="Console" className="flex flex-1 flex-col gap-4 overflow-y-auto">
        <div className="p-2">
          {!collapsed ? (
            <div className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">Console</div>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              const count = counts[item.area];
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
                    {!collapsed ? (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {count && count.value > 0 ? (
                          <Badge variant={count.tone} className="font-mono">
                            {count.value}
                          </Badge>
                        ) : null}
                      </>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="p-2">
          {!collapsed ? (
            <div className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">Elsewhere</div>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {ELSEWHERE_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground no-underline',
                      'hover:bg-sidebar-accent',
                      collapsed && 'mx-auto w-8 justify-center px-0',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    {!collapsed ? (
                      <>
                        <span className="flex-1">{item.label}</span>
                        <ArrowUpRight
                          aria-hidden="true"
                          className="size-3.5 text-muted-foreground"
                        />
                      </>
                    ) : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="mt-auto p-2">
        <UserMenu {...me} collapsed={collapsed} />
      </div>
    </aside>
  );
}
