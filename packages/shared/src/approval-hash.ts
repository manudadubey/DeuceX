// The one hash algorithm both sides of the approval gate must agree on: the
// side that creates an `approvals` row (a player's own tap, TECH-ARCHITECTURE.md
// section 3) and `packages/actions`'s gate, which refuses to run unless the
// payload it was called with hashes to the same value the player approved.
// Lives here, not in packages/db or packages/actions, so neither has to
// depend on the other just to agree on this. Not "business logic" in the
// sense packages/shared's own comment warns against — it has no domain rules,
// just a deterministic canonical hash, the same kind of "the whole platform
// agrees on this" fact as the types above it.
//
// Web Crypto (globalThis.crypto.subtle), not node:crypto: this file is
// imported from apps/web client components too (packages/db's approvals.ts,
// pulled in by lib/approvals/confirm-approval.ts and, transitively, by
// anything else importing from @deucex/db — Match Scribe's history list
// among them, step 1.1), and Next.js's client webpack bundle has no `node:`
// scheme polyfill. Web Crypto is a Node 20+ and browser standard, so the
// same code runs unmodified on both sides of the gate.
export async function hashApprovalPayload(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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
