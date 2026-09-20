// The only package allowed to import Stripe, Resend, ICS or entry-submission
// clients (enforced by the root eslint.config.mjs no-restricted-imports rule).
// Every exported action takes an approvalId first and must load and consume
// the matching `approvals` row before doing anything external.
// PRD-00 M-GATE-1 to M-GATE-4; TECH-ARCHITECTURE.md section 3.
//
// Nothing is implemented yet: the approvals table, recordRun() and the queue
// idempotency key land in build plan step 0.6. Nothing here may call a real
// vendor until that gate exists and is tested.

export const PLACEHOLDER = 'procircuit-actions' as const;
