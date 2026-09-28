import { describe, expect, it } from 'vitest';
import { AUDIO_PRICING, MODEL_PRICING } from '@deucex/actions';
import { MODEL_CALL_TIERS, type ModelCall } from '@deucex/shared';
import { TIER_MODELS, modelFor } from './models';
import { EXTRACTION_MODEL } from './match-scribe/extract';
import { INSIGHT_MODEL } from './mindset-coach/model-client';
import { FINANCIAL_ACTION_MODEL } from './financial/model-client';
import { RECEIPT_EXTRACTION_MODEL } from './financial/receipt-model-client';
import { CONTENT_DRAFT_MODEL } from './content/draft';
import { CONTENT_REWRITE_MODEL } from './content/rewrite';
import { PROSE_MODEL } from './conditions/generate-prose';
import { PATRON_NOTE_MODEL } from './fans/note-draft';
import { MENU_EXTRACTION_MODEL } from './fuel/menu-model-client';
import { MEMO_MODEL } from './tournament/memo';

describe('model tiers', () => {
  it('prices every tier model, so no run drops out of the spend figure', () => {
    for (const model of Object.values(TIER_MODELS)) {
      expect(MODEL_PRICING[model] ?? AUDIO_PRICING[model]).toBeDefined();
    }
  });

  it('resolves every agent constant through its tier', () => {
    const constants: Partial<Record<ModelCall, string>> = {
      matchScribeExtract: EXTRACTION_MODEL,
      mindsetInsight: INSIGHT_MODEL,
      financialAction: FINANCIAL_ACTION_MODEL,
      receiptExtract: RECEIPT_EXTRACTION_MODEL,
      contentDraft: CONTENT_DRAFT_MODEL,
      contentRewrite: CONTENT_REWRITE_MODEL,
      conditionsProse: PROSE_MODEL,
      patronNote: PATRON_NOTE_MODEL,
      fuelMenuScan: MENU_EXTRACTION_MODEL,
      tournamentMemo: MEMO_MODEL,
    };
    for (const [call, model] of Object.entries(constants)) {
      expect(model).toBe(modelFor(call as ModelCall));
    }
    expect(Object.keys(constants).length).toBe(Object.keys(MODEL_CALL_TIERS).length - 1);
  });

  it('keeps the drafting tier for the patron update draft only', () => {
    const drafting = Object.entries(MODEL_CALL_TIERS).filter(([, tier]) => tier === 'drafting');
    expect(drafting.map(([call]) => call)).toEqual(['contentDraft']);
  });
});
