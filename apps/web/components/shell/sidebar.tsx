'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FLAG_CODES, Flag, Logo, cn, type FlagCode } from '@deucex/ui';
import { countryCode } from '@/lib/country';
import { NAV_GROUPS, type NavItem } from './routes';
import { useNavBadges, type NavBadges } from './use-nav-badges';

export interface SidebarPlayer {
  id: string;
  name: string;
  tier: string | null;
  tour: string;
  /** Null until the ranking is verified. */
  tourRank: number | null;
  country: string;
  homeCurrency: string;
  weeklyBudget: number | null;
}

export interface SidebarProps {
  collapsed: boolean;
  email?: string | undefined;
  player?: SidebarPlayer | null;
}

const PLAN_LABEL: Record<string, string> = {
  free: 'Free plan',
  pro: 'Pro plan',
  elite: 'Elite plan',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')
  ).toUpperCase();
}

function badgeText(item: NavItem, badges: NavBadges): string | null {
  if (item.badge === 'fans') return badges.fans ? String(badges.fans) : null;
  if (item.badge === 'content') return badges.contentDrafts ? String(badges.contentDrafts) : null;
  if (item.badge === 'tournament')
    return badges.tournamentDays != null ? `${badges.tournamentDays}d` : null;
  return null;
}

// `.sidebar` (Baseline §Shells and routes): 256px, 48px collapsed, hidden entirely under
// 900px in favour of the mobile tab bar (see tab-bar.tsx).
export function Sidebar({ collapsed, email, player = null }: SidebarProps) {
  const pathname = usePathname();
  const badges = useNavBadges(player);
  const code = player ? countryCode(player.country) : null;

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-border',
        'bg-sidebar p-2 text-sidebar-foreground transition-[width] duration-200 max-[900px]:hidden',
        collapsed ? 'w-12' : 'w-64',
      )}
    >
      {/* Collapsed, the rail is 48px with 8px padding, leaving 32px, so every block below
          drops its side padding (the prototype's `.shell.collapsed` rules). Without that the
          32px items overflow to the right and the logo is squeezed. */}
      <div className={cn('flex items-center gap-2.5 p-2', collapsed && 'justify-center px-0')}>
        <Logo className="shrink-0" />
        {!collapsed ? (
          <div className="leading-tight">
            <div className="text-sm font-medium">DeuceX</div>
            <div className="text-xs text-muted-foreground">
              {PLAN_LABEL[player?.tier ?? 'free'] ?? 'Free plan'} · Season{' '}
              {new Date().getFullYear()}
            </div>
          </div>
        ) : null}
      </div>

      <nav aria-label="Primary" className="flex flex-1 flex-col overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={collapsed ? 'py-2' : 'p-2'}>
            {!collapsed ? (
              <div className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">
                {group.label}
              </div>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                const badge = badgeText(item, badges);
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
                        collapsed && 'relative mx-auto w-8 justify-center px-0',
                      )}
                    >
                      {collapsed && badge ? (
                        // The badge has no room collapsed, so it becomes a dot in its colour.
                        <span
                          aria-hidden="true"
                          className={cn(
                            'absolute right-[0.3125rem] top-[0.3125rem] size-1.5 rounded-full',
                            item.badge === 'tournament'
                              ? 'bg-warn'
                              : item.badge === 'content'
                                ? 'bg-chart-2'
                                : 'bg-muted-foreground',
                          )}
                        />
                      ) : null}
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          'size-4 shrink-0 text-muted-foreground',
                          active && 'text-sidebar-foreground',
                        )}
                      />
                      {!collapsed ? item.label : null}
                      {!collapsed && badge ? (
                        <span
                          className={cn(
                            'ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-xs font-medium tabular-nums',
                            item.badge === 'tournament'
                              ? 'bg-warn-bg text-warn'
                              : item.badge === 'content'
                                ? 'bg-chart-2/16 text-chart-2'
                                : 'bg-secondary text-secondary-foreground',
                          )}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('mt-auto', collapsed ? 'py-2' : 'p-2')}>
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
            {player ? initials(player.name) : (email?.[0] ?? '?').toUpperCase()}
          </div>
          {!collapsed ? (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium">
                {player?.name ?? email ?? 'Signed in'}
              </div>
              {player ? (
                <div className="truncate text-xs text-muted-foreground tabular-nums">
                  {player.tourRank != null
                    ? `${player.tour.toUpperCase()} ${player.tourRank}`
                    : 'Unverified'}
                  {code ? (
                    <>
                      {' · '}
                      {(FLAG_CODES as readonly string[]).includes(code) ? (
                        <Flag code={code as FlagCode} className="mr-1" />
                      ) : null}
                      {code}
                    </>
                  ) : null}
                </div>
              ) : null}
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
