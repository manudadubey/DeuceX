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

// AGENT_RUN_QUEUE/createBoss/enqueueAgentRun/registerAgentWorker live at the
// '@deucex/actions/queue' subpath, not here, because './queue/queue.ts'
// imports pg-boss, which imports the real `pg` driver (fs/net/tls/dns —
// Node built-ins with no browser shim). Everything below this comment has
// no such dependency, which is what lets packages/agents' financial module
// (step 2.2) import AgentValidationError/TokenUsage for apps/web's own
// client-bundle use without dragging a Postgres driver into the browser.
// apps/api is the only real consumer of the queue subpath.

export {
  markReceivableReceived,
  SupabaseReceivablesDb,
  ReceivableNotFoundOrAlreadyReceivedError,
  MissingReceivedDateRateError,
  type ReceivablesDb,
  type PendingReceivable,
  type ReceivedReceivableResult,
  type MarkReceivableReceivedInput,
} from './receivables';

export {
  confirmEntry,
  withdrawEntry,
  SupabaseEntriesDb,
  EntryNotAvailableError,
  EntryNotEnteredError,
  EntryDeadlinePassedError,
  type EntriesDb,
  type EntryContext,
  type ConfirmEntryInput,
  type ConfirmEntryResult,
  type WithdrawEntryInput,
  type WithdrawEntryResult,
} from './entries';

// requestAccountDeletion/requestDataExport (account.ts) and
// createResendEmailClient (resend-client.ts) live at the
// '@deucex/actions/account' subpath, not here, same reasoning as the
// './queue' split above: resend-client.ts imports the real 'resend' SDK,
// and packages/agents' financial module already imports symbols from this
// main barrel for apps/web's own client bundle (AgentValidationError,
// TokenUsage) — keeping a vendor SDK off this path is what keeps that
// bundle clean. apps/api is the only real consumer of the account subpath.

export { buildAgentJobSingletonKey, type AgentJobKeyInput } from './queue/idempotency-key';
export {
  evaluatePickup,
  type PickupDecision,
  type PickupGuardInput,
  type ProviderState,
} from './queue/pickup-guard';
export { MAX_RETRIES, nextRetryDelaySeconds } from './queue/retry-schedule';
