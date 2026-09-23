// Every agent lives here as a schema-validated, single-shot function over a
// pre-assembled input bundle (TECH-ARCHITECTURE.md section 3). No agent may
// import Stripe, Resend, or any client that reaches the outside world; that
// is packages/actions' job, gated behind an approval row. The first agent is
// match-scribe/extract (build plan step 1.2); the second is mindset-coach
// (step 1.3), the first to actually run on the AGENT_RUN_QUEUE scheduled
// infra step 0.6 built ahead of any agent needing it. The third, financial
// (step 2.2), is really two: a deterministic runway/burn/projection/budget
// engine with one short model call to phrase its "one thing" action, and a
// separate event-triggered receipt-extraction call (mirroring
// match-scribe/extract, not the scheduled half).

export * from './match-scribe';
export * from './mindset-coach';
export * from './financial';
