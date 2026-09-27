import { MODEL_CALL_TIERS, type ModelCall, type ModelTier } from '@deucex/shared';

// The model behind each tier (TECH-ARCHITECTURE.md section 5: "the model
// behind each label a configuration value, not copy"). Every agent's model
// constant resolves through modelFor(), so this table is the one place a
// tier moves to another model. models.test.ts fails if a tier's model has no
// row in packages/actions' pricing table, since a run with no price would
// drop out of the console's spend figure and its 80 percent alert.
export const TIER_MODELS: Record<ModelTier, string> = {
  drafting: 'gpt-4o',
  structured: 'gpt-4o-mini',
  extraction: 'gpt-4o-mini',
  transcription: 'whisper-1',
};

export function modelFor(call: ModelCall): string {
  return TIER_MODELS[MODEL_CALL_TIERS[call]];
}
