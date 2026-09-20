// Every agent lives here as a schema-validated, single-shot function over a
// pre-assembled input bundle (TECH-ARCHITECTURE.md section 3). No agent may
// import Stripe, Resend, or any client that reaches the outside world; that
// is packages/actions' job, gated behind an approval row. No agent is built
// yet: the first is match-scribe/extract (build plan step 1.2).

export const PLACEHOLDER = 'procircuit-agents' as const;
