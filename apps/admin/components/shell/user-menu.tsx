'use client';

import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, LogOut, ScrollText, Waypoints } from 'lucide-react';
import { ADMIN_ROLE_LABELS, ADMIN_ROLES, roleAtLeast, type AdminRole } from '@deucex/shared';
import { cn } from '@deucex/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setRolePreview } from '@/lib/browser-api';

const ROLE_SCOPE: Record<AdminRole, string> = {
  owner: 'money, deletes, kill switches',
  ops: 'agents, ingestion',
  support: 'players, account actions',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// `#umenu` (PRD-13 section 4.1): the signed-in admin and role, a role
// preview that can only narrow (the API enforces the same rule), the
// admin's own audit log, and sign out. Opens upward from the sidebar foot.
export function UserMenu({
  name,
  email,
  role,
  actingRole,
  collapsed,
}: {
  name: string;
  email: string;
  role: AdminRole;
  actingRole: AdminRole;
  collapsed: boolean;
}) {
  const router = useRouter();
  const previewing = actingRole !== role;

  function preview(next: AdminRole) {
    setRolePreview(next === role ? null : next);
    router.push('/');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md p-2 text-left outline-none hover:bg-sidebar-accent',
          'focus-visible:ring-2 focus-visible:ring-ring',
          collapsed && 'justify-center px-0',
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-xs font-semibold text-primary-foreground"
        >
          {initials(name)}
        </span>
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {previewing
                  ? `Previewing ${ADMIN_ROLE_LABELS[actingRole]}`
                  : `${ADMIN_ROLE_LABELS[role]} · ${role === 'owner' ? 'all areas' : ROLE_SCOPE[role]}`}
              </span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="size-4 text-muted-foreground" />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-sm font-medium text-foreground">
            {name}
            <span className="block text-xs font-normal text-muted-foreground">{email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Preview as role</DropdownMenuLabel>
          {ADMIN_ROLES.filter((r) => roleAtLeast(role, r))
            .slice()
            .reverse()
            .map((r) => (
              <DropdownMenuItem key={r} onClick={() => preview(r)}>
                <Check
                  aria-hidden="true"
                  className={cn('size-4', r === actingRole ? 'opacity-100' : 'opacity-0')}
                />
                {ADMIN_ROLE_LABELS[r]}
                <span className="ml-auto text-xs text-muted-foreground">{ROLE_SCOPE[r]}</span>
              </DropdownMenuItem>
            ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/audit')}>
          <ScrollText aria-hidden="true" />
          My admin audit log
        </DropdownMenuItem>
        {roleAtLeast(actingRole, 'ops') ? (
          <DropdownMenuItem onClick={() => router.push('/routing')}>
            <Waypoints aria-hidden="true" />
            Alert routing
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            setRolePreview(null);
            const form = document.createElement('form');
            form.method = 'post';
            form.action = '/auth/signout';
            document.body.appendChild(form);
            form.submit();
          }}
        >
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
