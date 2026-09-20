// The only package allowed to import Stripe, Resend, ICS or entry-submission
// clients (enforced by the root eslint.config.mjs no-restricted-imports rule
// and lint-rule.test.ts). Every exported action is built on runGatedAction
// (gate.ts), which loads the matching approvals row, verifies it is
// unconsumed and its payload hash matches, and claims it before the side
// effect runs. PRD-00 M-GATE-1 to M-GATE-4; TECH-ARCHITECTURE.md section 3.
//
// No agent and no vendor client exists yet (step 0.6 is the gate and the
// run/queue infrastructure only, per its own build-plan prompt: "nothing in
// this step may call a real vendor"). The first real action lands with the
// first agent in Phase 1.

export {
  ApprovalActionMismatchError,
  ApprovalAlreadyConsumedError,
  ApprovalNotFoundError,
  ApprovalPayloadMismatchError,
  AgentValidationError,
} from './errors';

export {
  runGatedAction,
  SupabaseApprovalGateDb,
  type ApprovalGateDb,
  type ApprovalRecord,
  type RunGatedActionInput,
} from './gate';

export {
  recordRun,
  SupabaseAgentRunsDb,
  type AgentRunsDb,
  type AgentRunInsert,
  type AgentRunMeta,
  type AgentRunStatus,
  type AgentRunTriggerType,
  type AgentCallResult,
} from './record-run';

export {
  calculateCost,
  MODEL_PRICING,
  type CostEstimate,
  type ModelPricing,
  type TokenUsage,
} from './pricing';

export {
  AGENT_RUN_QUEUE,
  createBoss,
  enqueueAgentRun,
  registerAgentWorker,
  type AgentJobData,
  type AgentWorkerDeps,
  type EnqueueAgentRunInput,
} from './queue/queue';

export { buildAgentJobSingletonKey, type AgentJobKeyInput } from './queue/idempotency-key';
export {
  evaluatePickup,
  type PickupDecision,
  type PickupGuardInput,
  type ProviderState,
} from './queue/pickup-guard';
export { MAX_RETRIES, nextRetryDelaySeconds } from './queue/retry-schedule';
