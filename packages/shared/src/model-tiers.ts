// Model tiering (TECH-ARCHITECTURE.md section 5's second fix, step 5.4). Each
// model call belongs to one tier; the tier, not a model name, is what the
// interface shows ("No model provider names in the interface"), and
// packages/agents/src/models.ts maps each tier to the model it runs on. So
// moving a tier to another model is one line there, and the label a player
// sees never drifts from what actually runs.
export type ModelTier = 'drafting' | 'structured' | 'extraction' | 'transcription';

export const MODEL_TIER_LABELS: Record<ModelTier, string> = {
  drafting: 'Drafting model',
  structured: 'Structured-output model',
  extraction: 'Extraction model',
  transcription: 'Transcription model',
};

/**
 * Every model call in the product and its tier. Drafting is the larger,
 * voice-sensitive tier, kept for the one text a player publishes under their
 * own name (the patron update draft, owner decision in step 4.2); everything
 * frequent and short sits on the smaller tiers.
 */
export const MODEL_CALL_TIERS = {
  matchScribeTranscribe: 'transcription',
  matchScribeExtract: 'extraction',
  receiptExtract: 'extraction',
  fuelMenuScan: 'extraction',
  mindsetInsight: 'structured',
  financialAction: 'structured',
  conditionsProse: 'structured',
  patronNote: 'structured',
  contentRewrite: 'structured',
  contentDraft: 'drafting',
} as const satisfies Record<string, ModelTier>;

export type ModelCall = keyof typeof MODEL_CALL_TIERS;

/** The interface label for a model call's tier. */
export function modelLabel(call: ModelCall): string {
  return MODEL_TIER_LABELS[MODEL_CALL_TIERS[call]];
}
