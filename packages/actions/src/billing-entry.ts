// The '@deucex/actions/billing' subpath (package.json's `exports` map): a
// player's own plan (docs/BILLING-DECISIONS.md). stripe-client.ts imports the
// real 'stripe' SDK, so this stays off the main barrel, the same reason
// './fans' does. apps/api is the only consumer.

export {
  createStripeBillingClient,
  ensurePlanPrices,
  type EnsuredPlanPrice,
  type PlanPriceSpec,
  type BillingStripeClient,
  type PlanCheckoutSummary,
  type PlanPriceSummary,
  type PlanSubscriptionSummary,
} from './stripe-client';

export {
  AlreadySubscribedError,
  BillingPlayerMissingError,
  CHECKOUT_MIN_TRIAL_LEAD_MS,
  CheckoutNotYoursError,
  LIVE_SUBSCRIPTION_STATUSES,
  NoSubscriptionError,
  PlanChangeUnavailableError,
  PlanPriceMissingError,
  SupabaseBillingActionsDb,
  cancelPlan,
  checkoutTrialEnd,
  completeSubscriptionCheckout,
  isLiveSubscriptionStatus,
  startSubscriptionCheckout,
  subscriptionCheckoutPayload,
  tierStatusForSubscription,
  type BillingActionsDb,
  type BillingEventKind,
  type BillingPlayer,
  type BillingSubscriptionRow,
  type CancelPlanResult,
  type CompleteCheckoutResult,
} from './billing';
