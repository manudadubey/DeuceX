import { roundCents } from './metrics';

// PRD-04 section 7 and decisions worksheet 5/6: the platform fee is taken on
// the gross patron payment, Stripe's own charge is a separate deduction, and
// net = gross - platform fee - Stripe. With direct charges on the player's
// Express account (owner decision, step 4.1) all three figures come straight
// off Stripe's balance transactions for a payout; nothing here re-derives a
// fee Stripe already charged.

export interface PayoutBreakdown {
  gross: number;
  platformFee: number;
  stripeFee: number;
  net: number;
}

/** A balance transaction on the connected account, in major units, as the payout breakdown reads it. */
export interface PayoutBalanceLine {
  /** 'charge' | 'payment' | 'refund' | 'payment_refund' | anything else (ignored). */
  type: string;
  amount: number;
  feeDetails: ReadonlyArray<{ type: string; amount: number }>;
}

/**
 * Sums a payout's balance transactions into P-13's four columns. Stripe's own
 * GST on its fees (fee type 'tax') counts toward the Stripe column, since the
 * player sees it as part of Stripe's charge, not ProCircuit's.
 */
export function payoutBreakdownFromBalance(lines: readonly PayoutBalanceLine[]): PayoutBreakdown {
  let gross = 0;
  let platformFee = 0;
  let stripeFee = 0;
  for (const line of lines) {
    if (!['charge', 'payment', 'refund', 'payment_refund'].includes(line.type)) continue;
    gross += line.amount;
    for (const fee of line.feeDetails) {
      if (fee.type === 'application_fee') platformFee += fee.amount;
      else stripeFee += fee.amount;
    }
  }
  gross = roundCents(gross);
  platformFee = roundCents(platformFee);
  stripeFee = roundCents(stripeFee);
  return { gross, platformFee, stripeFee, net: roundCents(gross - platformFee - stripeFee) };
}

/** Stripe's standard domestic card rate as PRD-04's footer states it: 1.75 percent plus 30c per charge. */
export const STRIPE_PERCENT = 0.0175;
export const STRIPE_FIXED = 0.3;

/**
 * PRD-04 section 7's formula applied to a list of patron charges, rounding
 * each fee per charge to the cent the way Stripe does per invoice. Used for
 * the "Next payout" estimate before Stripe has created the payout object, and
 * as the fixture proof of the A$612 -> A$49 / A$14 / A$549 arithmetic.
 */
export function estimatePayout(charges: readonly number[], feeRate: number): PayoutBreakdown {
  let gross = 0;
  let platformFee = 0;
  let stripeFee = 0;
  for (const amount of charges) {
    gross += amount;
    platformFee += roundCents(amount * feeRate);
    stripeFee += roundCents(amount * STRIPE_PERCENT + STRIPE_FIXED);
  }
  gross = roundCents(gross);
  platformFee = roundCents(platformFee);
  stripeFee = roundCents(stripeFee);
  return { gross, platformFee, stripeFee, net: roundCents(gross - platformFee - stripeFee) };
}

/** Stripe's zero-decimal currencies (amounts are already whole units). */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF', 'PYG']);

/** Stripe amounts are in the currency's smallest unit; this returns major units. */
export function fromMinorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? amount : amount / 100;
}

export function toMinorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? Math.round(amount) : Math.round(amount * 100);
}

/**
 * PRD-04's own money style: "A$612", "−A$49". The en-US symbol table is used
 * deliberately because en-AU renders AUD as a bare "$", which is ambiguous
 * on a page a patron or manager abroad may also read (M-CUR-1).
 */
export function formatPatronMoney(amount: number, currency: string, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(amount)
    .replace('-', '−');
}
