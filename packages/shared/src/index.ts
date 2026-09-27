// Cross-cutting types shared by every app and package.
// Kept intentionally small: this package holds constants and types the whole
// platform agrees on, not business logic (that belongs in packages/agents or
// packages/actions).

export type Tour = 'atp' | 'wta';

export type HomeCurrency = 'AUD' | 'USD' | 'CNY';

export type Units = 'metric' | 'imperial';

export type Stage = 1 | 2 | 3;

export { hashApprovalPayload } from './approval-hash';

export { AGENT_NAMES, type AgentName } from './agent-names';

// Step 4.1b: the patron-facing notice texts (PRD-04 P-18, "a notice the
// player has seen first"). Shared so apps/web's confirm step and
// packages/actions' email print the exact same words; copy, not logic.
export {
  billingPauseNotice,
  billingResumeNotice,
  accountClosedNotice,
  membershipEndedNotice,
  pausedMembershipEndDate,
  PAUSED_MEMBERSHIP_DAYS,
  manageLinkNotice,
  cancellationReason,
  type PatronNotice,
  type PatronNoticeInput,
} from './patron-notices';

// Step 4.2: the Content Agent's publish approval payload, built identically
// by apps/web (at confirm) and packages/actions (at send).
export {
  contentPublishPayload,
  type ContentPublishPayload,
  type ContentPublishPayloadInput,
} from './content-publish';

// Step 5.1: the admin console's staff roles and the areas each holds.
export {
  ADMIN_ROLES,
  ADMIN_ROLE_LABELS,
  adminAreas,
  canAccessArea,
  effectiveRole,
  roleAtLeast,
  type AdminArea,
  type AdminRole,
} from './admin-roles';

export {
  MODEL_CALL_TIERS,
  MODEL_TIER_LABELS,
  modelLabel,
  type ModelCall,
  type ModelTier,
} from './model-tiers';

export {
  ON_DEMAND_LIMITS,
  ON_DEMAND_NOUNS,
  ON_DEMAND_WINDOW_MS,
  limitFor,
  type LimitTier,
  type OnDemandKind,
} from './rate-limits';

// Billing (docs/BILLING-DECISIONS.md): USD plan prices and trial constants.
export {
  ANNUAL_SAVING_LABEL,
  PAID_PLANS,
  PLAN_PRICES_USD,
  TRIAL_DAYS,
  TRIAL_REMINDER_DAYS_BEFORE_END,
  formatUsd,
  isBillingCycle,
  isPaidPlan,
  planAnnualSavingPercent,
  planChargeAmount,
  planPriceLine,
  planPriceLookupKey,
  planYearlyTotal,
  type BillingCycle,
  type PaidPlan,
} from './plans';
