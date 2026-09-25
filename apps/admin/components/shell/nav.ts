import {
  Activity,
  CreditCard,
  Database,
  HeartPulse,
  LayoutDashboard,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AdminArea } from '@deucex/shared';

// PRD-13 section 4.1: Console (six areas) and Elsewhere (link-outs). An
// area outside the acting role is removed from the sidebar and tab bar, not
// disabled, so a screenshot can't show it (AD-2).
export interface NavItem {
  area: AdminArea;
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
}

export const CONSOLE_NAV: readonly NavItem[] = [
  { area: 'overview', href: '/', label: 'Overview', short: 'Overview', icon: LayoutDashboard },
  { area: 'players', href: '/players', label: 'Players', short: 'Players', icon: Users },
  { area: 'agents', href: '/agents', label: 'Agent health', short: 'Agents', icon: HeartPulse },
  { area: 'ingestion', href: '/ingestion', label: 'Ingestion', short: 'Data', icon: Database },
  { area: 'money', href: '/money', label: 'Money', short: 'Money', icon: CreditCard },
  { area: 'trust', href: '/trust', label: 'Trust and safety', short: 'Trust', icon: ShieldCheck },
];

export const ELSEWHERE_NAV = [
  { href: 'https://dashboard.stripe.com/test/dashboard', label: 'Stripe', icon: CreditCard },
  { href: 'https://grafana.com/', label: 'Grafana', icon: Activity },
  { href: 'https://resend.com/emails', label: 'Resend', icon: Activity },
] as const;

export const ROUTE_TITLES: Record<string, string> = {
  '/': 'Overview',
  '/players': 'Players',
  '/agents': 'Agent health',
  '/ingestion': 'Ingestion',
  '/money': 'Money',
  '/trust': 'Trust and safety',
  '/audit': 'My admin audit log',
  '/routing': 'Alert routing',
};

export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
