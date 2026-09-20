import type { ComponentType, SVGProps } from 'react';
import {
  Banknote,
  Brain,
  Calendar,
  Fuel,
  Home,
  Mic,
  Settings,
  Users,
  UserRound,
  PenLine,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Step 0.5's route table (docs/BUILD-PLAN-CLAUDE-CODE.md), grouped as in the prototype's
// sidebar (docs/procircuit-dashboard.html). The Sponsor and Fan agents are Elite-only and
// out of scope until they're built (PRD-09, PRD-10), so they're not in the nav yet.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/', label: 'Dashboard', icon: Home },
      { href: '/match-scribe', label: 'Match Scribe', icon: Mic },
      { href: '/fuel', label: 'Fuel', icon: Fuel },
      { href: '/fans', label: 'Fans', icon: Users },
    ],
  },
  {
    label: 'Agents',
    items: [
      { href: '/agent/tournament', label: 'Tournament', icon: Calendar },
      { href: '/agent/content', label: 'Content', icon: PenLine },
      { href: '/agent/mindset', label: 'Mindset Coach', icon: Brain },
      { href: '/agent/financial', label: 'Financial', icon: Banknote },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/profile', label: 'Public profile', icon: UserRound },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

// Same route set, flattened, for the page-title lookup in the topbar crumb.
export const ROUTE_TITLES: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((group) => group.items).map((item) => [item.href, item.label]),
);

// The mobile tab bar shows five of the ten routes (docs/procircuit-dashboard.html `.tabbar`);
// the rest are one tap away from Dashboard until there's a "More" sheet to hold them.
export const TAB_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/agent/tournament', label: 'Tournaments', icon: Calendar },
  { href: '/match-scribe', label: 'Scribe', icon: Mic },
  { href: '/fans', label: 'Fans', icon: Users },
  { href: '/agent/financial', label: 'Money', icon: Banknote },
];
