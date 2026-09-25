// Cross-cutting types shared by every app and package.
// Kept intentionally small: this package holds constants and types the whole
// platform agrees on, not business logic (that belongs in packages/agents or
// packages/actions).

export type Tour = 'atp' | 'wta';

export type HomeCurrency = 'AUD' | 'USD' | 'CNY';

export type Units = 'metric' | 'imperial';

export type Stage = 1 | 2 | 3;

export { hashApprovalPayload } from './approval-hash';

// Step 4.1b: the patron-facing notice texts (PRD-04 P-18, "a notice the
// player has seen first"). Shared so apps/web's confirm step and
// packages/actions' email print the exact same words; copy, not logic.
export {
  billingPauseNotice,
  billingResumeNotice,
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
