import { createHash } from 'node:crypto';

// The one hash algorithm both sides of the approval gate must agree on: the
// side that creates an `approvals` row (a player's own tap, TECH-ARCHITECTURE.md
// section 3) and `packages/actions`'s gate, which refuses to run unless the
// payload it was called with hashes to the same value the player approved.
// Lives here, not in packages/db or packages/actions, so neither has to
// depend on the other just to agree on this. Not "business logic" in the
// sense packages/shared's own comment warns against — it has no domain rules,
// just a deterministic canonical hash, the same kind of "the whole platform
// agrees on this" fact as the types above it.
export function hashApprovalPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalize(payload)).digest('hex');
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`,
  );
  return `{${entries.join(',')}}`;
}
