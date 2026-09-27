// Creates (or confirms) the four plan prices in Stripe, by lookup key
// (docs/BILLING-DECISIONS.md: Pro US$35 or US$336 a year, Elite US$99 or
// US$948 a year). Idempotent: run it again and unchanged prices are kept. A
// changed amount in @deucex/shared's PLAN_PRICES_USD mints a new price and
// moves the lookup key, so existing subscribers keep theirs.
//
// Usage: pnpm --filter @deucex/api exec tsx scripts/billing-prices.ts
// Uses STRIPE_SECRET_KEY from the repo's .env. Refuses a live key unless
// BILLING_PRICES_ALLOW_LIVE=1 is set, so go-live is a deliberate step.

import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { ensurePlanPrices, type PlanPriceSpec } from '@deucex/actions/billing';
import {
  PAID_PLANS,
  planChargeAmount,
  planPriceLookupKey,
  type BillingCycle,
} from '@deucex/shared';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const key = (process.env.STRIPE_SECRET_KEY ?? '').trim();
if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
if (key.startsWith('sk_live_') && process.env.BILLING_PRICES_ALLOW_LIVE !== '1') {
  throw new Error('Refusing a live key without BILLING_PRICES_ALLOW_LIVE=1');
}

const specs: PlanPriceSpec[] = PAID_PLANS.flatMap((plan) =>
  (['monthly', 'annual'] as BillingCycle[]).map((cycle) => ({
    plan,
    productName: plan === 'pro' ? 'DeuceX Pro' : 'DeuceX Elite',
    lookupKey: planPriceLookupKey(plan, cycle),
    amountMinor: planChargeAmount(plan, cycle) * 100,
    currency: 'USD',
    interval: cycle === 'monthly' ? ('month' as const) : ('year' as const),
  })),
);

const results = await ensurePlanPrices({ secretKey: key }, specs);
for (const r of results)
  console.log(`${r.lookupKey.padEnd(22)} ${r.action.padEnd(8)} ${r.priceId}`);
