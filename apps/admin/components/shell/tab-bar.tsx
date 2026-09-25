'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminArea } from '@deucex/shared';
import { cn } from '@deucex/ui';
import { CONSOLE_NAV, isActive } from './nav';

// PRD-13 section 4.1: under 900px the sidebar becomes a tab bar of the
// areas the role holds (up to six). Same `.tabbar` recipe as the player app.
export function TabBar({ areas }: { areas: readonly AdminArea[] }) {
  const pathname = usePathname() ?? '/';
  const items = CONSOLE_NAV.filter((item) => areas.includes(item.area));

  return (
    <nav
      aria-label="Console"
      className={cn(
        'fixed inset-x-0 bottom-0 z-[25] hidden items-end border-t border-border',
        'bg-background/78 px-2 pt-1.5 backdrop-blur-xl backdrop-saturate-[1.8]',
        'pb-[calc(0.375rem+env(safe-area-inset-bottom))] max-[900px]:grid',
      )}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[0.6875rem]',
              'font-medium text-muted-foreground no-underline',
              active && 'text-foreground',
            )}
          >
            <Icon aria-hidden="true" className="size-[1.375rem] stroke-[1.75]" />
            <span>{item.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
