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
// match-scribe/extract, not the scheduled half). The fourth, tournament
// (step 3.2), is fully deterministic — no model call at all: the shortlist
// ranking, cost model and why-text are all pure functions over the input
// bundle (see docs/BUILD-LOG.md's step 3.2 entry for why an LLM-authored
// why paragraph and recommendation memo are deliberately out of scope this
// step). The fifth, conditions (step 3.3), is deterministic tiles and rules
// (amber, ball-diff, tension, frames, grip, unit conversion, stamps) plus
// one small model call for the brief's own comparison-and-practice prose,
// batched up to five briefs per call (PRD-08 section 3).

export * from './match-scribe';
export * from './mindset-coach';
export * from './financial';
export * from './tournament';
export * from './conditions';
export * from './fans';
export * from './content';
