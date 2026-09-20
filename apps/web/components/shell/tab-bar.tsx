'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@procircuit/ui';
import { TAB_ITEMS } from './routes';

// `.tabbar` (Baseline §Shells and routes): appears under 900px in place of the sidebar.
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-[25] hidden grid-cols-5 items-end border-t border-border',
        'bg-background/78 px-2 pt-1.5 backdrop-blur-xl backdrop-saturate-[1.8]',
        'pb-[calc(0.375rem+env(safe-area-inset-bottom))] max-[900px]:grid',
      )}
    >
      {TAB_ITEMS.map((item) => {
        const active = pathname === item.href;
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
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
