// PRD-13 section 2 and AD-2: the three staff roles and the console areas
// each one holds. Shared so apps/admin's navigation and apps/api's route
// guard read the same table (the server enforces it; the client hiding
// areas is a convenience, PRD-13 section 7 "Role visibility").

export type AdminRole = 'support' | 'ops' | 'owner';

export const ADMIN_ROLES: readonly AdminRole[] = ['support', 'ops', 'owner'];

export type AdminArea =
  'overview' | 'players' | 'agents' | 'ingestion' | 'money' | 'trust' | 'audit' | 'routing';

const AREAS_BY_ROLE: Record<AdminRole, readonly AdminArea[]> = {
  support: ['overview', 'players', 'trust', 'audit'],
  ops: ['overview', 'players', 'agents', 'ingestion', 'trust', 'audit', 'routing'],
  owner: ['overview', 'players', 'agents', 'ingestion', 'money', 'trust', 'audit', 'routing'],
};

export function adminAreas(role: AdminRole): readonly AdminArea[] {
  return AREAS_BY_ROLE[role];
}

export function canAccessArea(role: AdminRole, area: AdminArea): boolean {
  return AREAS_BY_ROLE[role].includes(area);
}

const RANK: Record<AdminRole, number> = { support: 0, ops: 1, owner: 2 };

/** True when `role` holds at least `minimum` (owner > ops > support). */
export function roleAtLeast(role: AdminRole, minimum: AdminRole): boolean {
  return RANK[role] >= RANK[minimum];
}

/**
 * The role preview in the user menu (PRD-13 section 4.1) can only narrow:
 * an owner may preview ops or support, ops may preview support, and nobody
 * previews upward. Anything else falls back to the real role.
 */
export function effectiveRole(actual: AdminRole, preview: string | null | undefined): AdminRole {
  if (!preview || !ADMIN_ROLES.includes(preview as AdminRole)) return actual;
  const wanted = preview as AdminRole;
  return RANK[wanted] <= RANK[actual] ? wanted : actual;
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  owner: 'Owner',
  ops: 'Ops',
  support: 'Support',
};
