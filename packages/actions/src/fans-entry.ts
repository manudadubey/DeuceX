// The '@deucex/actions/fans' subpath (package.json's `exports` map):
// stripe-client.ts imports the real 'stripe' SDK, so it stays off the main
// barrel for the same reason './account' keeps 'resend' off it (the main
// barrel reaches apps/web's client bundle transitively). apps/api is the
// only real consumer.

export {
  createStripeFansClient,
  stripeCountryCode,
  StripeCallFailedError,
  type FansStripeClient,
  type ConnectAccountState,
  type CheckoutSessionSummary,
  type SubscriptionSummary,
  type PayoutBalanceLineMinor,
  type StripeWebhookEvent,
} from './stripe-client';

export {
  startConnectOnboarding,
  publishTier,
  sendPatronNote,
  inviteFromWaitlist,
  createPatronCheckout,
  tierChangePayload,
  patronNotePayload,
  slugFromName,
  SupabaseFansActionsDb,
  FansProgrammeMissingError,
  PatronNotFoundError,
  PatronHasNoEmailError,
  WaitlistEntryUnavailableError,
  TierNotSellableError,
  InvalidTierInputError,
  PRO_PAGE_CAP,
  requestPatronManageLink,
  openPatronPortal,
  pausePatronBilling,
  resumePatronBilling,
  endPausedMembership,
  type EndPausedMembershipInput,
  createManageToken,
  verifyManageToken,
  ManageLinkInvalidError,
  MANAGE_LINK_TTL_MS,
  type PatronBillingResult,
  type FansActionsDb,
  type FansPlayer,
  type FansProgramme,
  type FansTier,
  type PatronNoteKind,
  type PatronCheckoutResult,
  type PublishTierResult,
} from './fans';
