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
  // match-scribe/extract (step 1.2) runs on this one, the same OpenAI
  // account as Whisper transcription.
  'gpt-4o-mini': { inputPerMillionTokens: 0.15, outputPerMillionTokens: 0.6, currency: 'USD' },
  // The Content Agent's patron-update draft (step 4.2, owner decision): the
  // one voice-sensitive text in the product, so the larger model on the
  // same account. Its rewrites stay on gpt-4o-mini.
  'gpt-4o': { inputPerMillionTokens: 2.5, outputPerMillionTokens: 10, currency: 'USD' },
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
