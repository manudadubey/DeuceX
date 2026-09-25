import Stripe from 'stripe';

// The only file in this codebase allowed to `import 'stripe'` (root
// eslint.config.mjs's no-restricted-imports rule; lint-rule.test.ts). Kept
// behind the narrow FansStripeClient interface below for the same reason
// resend-client.ts sits behind EmailClient: fans.ts's gated actions and
// apps/api's webhook service depend on the interface, so their tests need no
// real key and no network, and apps/api decides at wiring time whether a
// real client exists at all.
//
// Charge model (owner decision, step 4.1): direct charges on the player's
// Stripe Connect Express account. Every call below that touches a patron,
// a product, a price, a checkout session or a payout passes
// `stripeAccount`, so the object lives on the player's own account and
// Stripe's own fee is charged there, with ProCircuit's cut as
// application_fee_percent on the subscription (worksheet 5 and 6: taken on
// the gross, Stripe's charge separate).

export interface ConnectAccountState {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** Stripe has requirements currently due or past due (KYC lapsed). */
  requirementsDue: boolean;
  bankLast4: string | null;
}

export interface CheckoutSessionSummary {
  id: string;
  status: 'open' | 'complete' | 'expired';
  subscriptionId: string | null;
  customerId: string | null;
  name: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
  metadata: Record<string, string>;
  createdAt: string;
}

export interface SubscriptionSummary {
  id: string;
  status: string;
  customerId: string;
  priceId: string | null;
  productId: string | null;
  unitAmountMinor: number | null;
  currency: string;
  metadata: Record<string, string>;
  cancellationComment: string | null;
  cancellationFeedback: string | null;
  endedAt: string | null;
  canceledAt: string | null;
  /** Billing paused by the player's downgrade to Free (P-18). */
  paused: boolean;
  cancelAtPeriodEnd: boolean;
}

export interface PayoutBalanceLineMinor {
  type: string;
  amountMinor: number;
  feeDetails: Array<{ type: string; amountMinor: number }>;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  account: string | null;
  createdAt: string;
  object: Record<string, unknown>;
  previousAttributes: Record<string, unknown> | null;
}

export interface FansStripeClient {
  createExpressAccount(input: {
    email: string;
    country: string | null;
    metadata: Record<string, string>;
  }): Promise<{ id: string }>;
  createAccountLink(input: {
    account: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
  retrieveAccount(account: string): Promise<ConnectAccountState>;
  /** Creates the product on first publish, renames it after, and mints a new price when the amount changes (grandfathering: the old price keeps billing existing patrons). */
  upsertTierPrice(input: {
    account: string;
    productId: string | null;
    currentPriceId: string | null;
    name: string;
    description: string;
    amountMinor: number;
    currency: string;
    metadata: Record<string, string>;
  }): Promise<{ productId: string; priceId: string }>;
  createCheckoutSession(input: {
    account: string;
    priceId: string;
    applicationFeePercent: number;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string }>;
  retrieveCheckoutSession(input: { account: string; id: string }): Promise<CheckoutSessionSummary>;
  retrieveSubscription(input: { account: string; id: string }): Promise<SubscriptionSummary>;
  listPayoutBalanceLines(input: {
    account: string;
    payoutId: string;
  }): Promise<PayoutBalanceLineMinor[]>;
  verifyWebhook(rawBody: Buffer | string, signature: string, secret: string): StripeWebhookEvent;
  /** P-17: a Stripe customer-portal session for one patron on the player's account. */
  createPortalSession(input: {
    account: string;
    customerId: string;
    returnUrl: string;
    /** Every tier's product and its current price, so the portal can switch tiers. */
    products: Array<{ productId: string; priceId: string }>;
  }): Promise<{ url: string }>;
  /** P-18: pause (no further invoices) or resume one subscription's billing. */
  setSubscriptionPaused(input: {
    account: string;
    subscriptionId: string;
    paused: boolean;
  }): Promise<void>;
  /** Ends a subscription now (a membership paused for 90 days; owner decision 25 Sep 2026). */
  cancelSubscription(input: { account: string; subscriptionId: string }): Promise<void>;
}

export class StripeCallFailedError extends Error {
  constructor(reason: string) {
    super(`Stripe call failed: ${reason}`);
    this.name = 'StripeCallFailedError';
  }
}

// Stripe expects a two-letter country for an Express account. players.country
// holds the onboarding form's country name (packages/db's COUNTRY_DEFAULTS);
// anything unlisted is left for Stripe's own onboarding to ask.
const COUNTRY_CODES: Record<string, string> = {
  Australia: 'AU',
  Austria: 'AT',
  Germany: 'DE',
  Italy: 'IT',
  Spain: 'ES',
  'United States': 'US',
};

export function stripeCountryCode(countryName: string | null): string | null {
  if (!countryName) return null;
  return COUNTRY_CODES[countryName] ?? null;
}

/** Stripe's preview API version, needed for Express dashboard accounts with Managed Risk (Accounts v2). */
export const STRIPE_PREVIEW_API_VERSION = '2026-08-26.preview';

function iso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

function strMeta(meta: Stripe.Metadata | null | undefined): Record<string, string> {
  return { ...(meta ?? {}) };
}

export function createStripeFansClient(config: { secretKey: string }): FansStripeClient {
  const stripe = new Stripe(config.secretKey);

  async function wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw new StripeCallFailedError(err instanceof Error ? err.message : String(err));
    }
  }

  return {
    // Accounts v2 (Stripe no longer creates v1 connected accounts for new
    // platforms; found live in the sandbox, step 4.1). Owner decision, same
    // session: Stripe's Managed Risk (losses_collector stripe) with the
    // Express dashboard, and fees_collector stripe so Stripe takes its own
    // charge from the player's account and ProCircuit's cut stays exactly
    // application_fee_percent (worksheet 5 and 6). Express with Managed Risk
    // is a Stripe public preview, hence the pinned preview API version on
    // this one call.
    createExpressAccount: (input) =>
      wrap(async () => {
        const account = await stripe.v2.core.accounts.create(
          {
            contact_email: input.email,
            dashboard: 'express',
            ...(input.country ? { identity: { country: input.country } } : {}),
            defaults: {
              responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
            },
            configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
            metadata: input.metadata,
          },
          { apiVersion: STRIPE_PREVIEW_API_VERSION },
        );
        // P-12: weekly payouts, every Friday. Accounts v2 has no payout
        // schedule field at creation, so it is set on the same account
        // through v1's settings, which Stripe keeps interoperable.
        await stripe.accounts.update(account.id, {
          settings: { payouts: { schedule: { interval: 'weekly', weekly_anchor: 'friday' } } },
        });
        return { id: account.id };
      }),

    createAccountLink: (input) =>
      wrap(async () => {
        const link = await stripe.v2.core.accountLinks.create(
          {
            account: input.account,
            use_case: {
              type: 'account_onboarding',
              account_onboarding: {
                configurations: ['merchant'],
                refresh_url: input.refreshUrl,
                return_url: input.returnUrl,
              },
            },
          },
          { apiVersion: STRIPE_PREVIEW_API_VERSION },
        );
        return { url: link.url };
      }),

    retrieveAccount: (account) =>
      wrap(async () => {
        const a = await stripe.accounts.retrieve(account);
        // Only past-due items or a disabled account count as "action
        // required": currently_due routinely lists future-dated items on a
        // perfectly healthy account.
        const due = [
          ...(a.requirements?.past_due ?? []),
          ...(a.requirements?.disabled_reason ? [a.requirements.disabled_reason] : []),
        ];
        const bank = a.external_accounts?.data.find((x) => x.object === 'bank_account') as
          Stripe.BankAccount | undefined;
        return {
          chargesEnabled: a.charges_enabled ?? false,
          payoutsEnabled: a.payouts_enabled ?? false,
          detailsSubmitted: a.details_submitted ?? false,
          requirementsDue: due.length > 0,
          bankLast4: bank?.last4 ?? null,
        };
      }),

    upsertTierPrice: (input) =>
      wrap(async () => {
        const opts = { stripeAccount: input.account };
        let productId = input.productId;
        if (!productId) {
          const product = await stripe.products.create(
            {
              name: input.name,
              ...(input.description ? { description: input.description } : {}),
              metadata: input.metadata,
            },
            opts,
          );
          productId = product.id;
        } else {
          await stripe.products.update(
            productId,
            { name: input.name, description: input.description || '' },
            opts,
          );
        }

        if (input.currentPriceId) {
          const current = await stripe.prices.retrieve(input.currentPriceId, {}, opts);
          if (
            current.unit_amount === input.amountMinor &&
            current.currency === input.currency.toLowerCase()
          ) {
            return { productId, priceId: current.id };
          }
        }

        const price = await stripe.prices.create(
          {
            product: productId,
            unit_amount: input.amountMinor,
            currency: input.currency.toLowerCase(),
            recurring: { interval: 'month' },
            metadata: input.metadata,
          },
          opts,
        );
        await stripe.products.update(productId, { default_price: price.id }, opts);
        return { productId, priceId: price.id };
      }),

    createCheckoutSession: (input) =>
      wrap(async () => {
        const session = await stripe.checkout.sessions.create(
          {
            mode: 'subscription',
            line_items: [{ price: input.priceId, quantity: 1 }],
            billing_address_collection: 'required',
            subscription_data: {
              application_fee_percent: input.applicationFeePercent,
              metadata: input.metadata,
            },
            metadata: input.metadata,
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
          },
          { stripeAccount: input.account },
        );
        if (!session.url) throw new Error('Checkout session has no URL');
        return { id: session.id, url: session.url };
      }),

    retrieveCheckoutSession: (input) =>
      wrap(async () => {
        const s = await stripe.checkout.sessions.retrieve(
          input.id,
          {},
          { stripeAccount: input.account },
        );
        const details = s.customer_details;
        return {
          id: s.id,
          status: (s.status ?? 'open') as CheckoutSessionSummary['status'],
          subscriptionId:
            typeof s.subscription === 'string' ? s.subscription : (s.subscription?.id ?? null),
          customerId: typeof s.customer === 'string' ? s.customer : (s.customer?.id ?? null),
          name: details?.name ?? null,
          email: details?.email ?? null,
          city: details?.address?.city ?? null,
          country: details?.address?.country ?? null,
          metadata: strMeta(s.metadata),
          createdAt: iso(s.created) ?? new Date().toISOString(),
        };
      }),

    retrieveSubscription: (input) =>
      wrap(async () => {
        const sub = await stripe.subscriptions.retrieve(
          input.id,
          {},
          { stripeAccount: input.account },
        );
        const item = sub.items.data[0];
        return {
          id: sub.id,
          status: sub.status,
          customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
          priceId: item?.price.id ?? null,
          productId:
            typeof item?.price.product === 'string'
              ? item.price.product
              : (item?.price.product.id ?? null),
          unitAmountMinor: item?.price.unit_amount ?? null,
          currency: (item?.price.currency ?? sub.currency).toUpperCase(),
          metadata: strMeta(sub.metadata),
          cancellationComment: sub.cancellation_details?.comment ?? null,
          cancellationFeedback: sub.cancellation_details?.feedback ?? null,
          endedAt: iso(sub.ended_at),
          canceledAt: iso(sub.canceled_at),
          paused: sub.pause_collection != null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        };
      }),

    listPayoutBalanceLines: (input) =>
      wrap(async () => {
        const lines: PayoutBalanceLineMinor[] = [];
        for await (const bt of stripe.balanceTransactions.list(
          { payout: input.payoutId, limit: 100 },
          { stripeAccount: input.account },
        )) {
          lines.push({
            type: bt.type,
            amountMinor: bt.amount,
            feeDetails: bt.fee_details.map((f) => ({ type: f.type, amountMinor: f.amount })),
          });
        }
        return lines;
      }),

    verifyWebhook(rawBody, signature, secret) {
      const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
      const data = event.data as { object: unknown; previous_attributes?: unknown };
      return {
        id: event.id,
        type: event.type,
        account: event.account ?? null,
        createdAt: iso(event.created) ?? new Date().toISOString(),
        object: data.object as Record<string, unknown>,
        previousAttributes:
          (data.previous_attributes as Record<string, unknown> | undefined) ?? null,
      };
    },

    // One portal configuration per connected account, found by metadata and
    // kept in step with the tiers (a grandfathered price change mints a new
    // price, so the switchable prices are refreshed every time). Cancel is
    // at period end with Stripe's reason picker, so a departing patron keeps
    // what they paid for and P-17's reason is recorded when they give one.
    createPortalSession: (input) =>
      wrap(async () => {
        const opts = { stripeAccount: input.account };
        const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
          customer_update: { enabled: false },
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: {
            enabled: true,
            mode: 'at_period_end',
            cancellation_reason: {
              enabled: true,
              options: ['too_expensive', 'unused', 'switched_service', 'other'],
            },
          },
          subscription_update: {
            enabled: input.products.length > 1,
            default_allowed_updates: ['price'],
            proration_behavior: 'none',
            products: input.products.map((p) => ({ product: p.productId, prices: [p.priceId] })),
          },
        };
        const existing = (
          await stripe.billingPortal.configurations.list({ limit: 100 }, opts)
        ).data.find((c) => c.metadata?.procircuit === 'fans' && c.active);
        const configuration = existing
          ? await stripe.billingPortal.configurations.update(existing.id, { features }, opts)
          : await stripe.billingPortal.configurations.create(
              { features, metadata: { procircuit: 'fans' }, default_return_url: input.returnUrl },
              opts,
            );
        const session = await stripe.billingPortal.sessions.create(
          {
            customer: input.customerId,
            configuration: configuration.id,
            return_url: input.returnUrl,
          },
          opts,
        );
        return { url: session.url };
      }),

    setSubscriptionPaused: (input) =>
      wrap(async () => {
        await stripe.subscriptions.update(
          input.subscriptionId,
          // 'void': invoices due while paused are voided, so nothing is owed on resume.
          input.paused ? { pause_collection: { behavior: 'void' } } : { pause_collection: '' },
          { stripeAccount: input.account },
        );
      }),

    cancelSubscription: (input) =>
      wrap(async () => {
        await stripe.subscriptions.cancel(
          input.subscriptionId,
          { cancellation_details: { comment: 'Ended after 90 days paused' } },
          { stripeAccount: input.account },
        );
      }),
  };
}
