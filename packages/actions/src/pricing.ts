// The "small, manually maintained pricing table (model name to cost per
// token)" TECH-ARCHITECTURE.md section 3 asks recordRun() to use. Figures
// below are illustrative starting points taken from each vendor's public
// per-million-token rate at the time this was written, in the same spirit
// as TECH-ARCHITECTURE.md's own section 5 ("marked as an estimate... not
// asserted as fact"); update this table whenever a vendor changes pricing,
// and check it against the vendor's current published rate before it's
// used for anything beyond illustrative unit-economics tracking.
export interface ModelPricing {
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
  currency: 'USD';
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-5': { inputPerMillionTokens: 15, outputPerMillionTokens: 75, currency: 'USD' },
  'claude-sonnet-5': { inputPerMillionTokens: 3, outputPerMillionTokens: 15, currency: 'USD' },
  'claude-haiku-4-5-20251001': {
    inputPerMillionTokens: 1,
    outputPerMillionTokens: 5,
    currency: 'USD',
  },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostEstimate {
  amount: number;
  currency: string;
}

// Returns null for a model this table doesn't know about, rather than
// guessing: an agent_runs row with no cost recorded is a visible gap to
// backfill, a wrong cost is not.
export function calculateCost(model: string, usage: TokenUsage): CostEstimate | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;

  const amount =
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillionTokens +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillionTokens;

  return { amount: Number(amount.toFixed(6)), currency: pricing.currency };
}
