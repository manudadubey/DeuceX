import { AgentValidationError, type TokenUsage } from '@deucex/actions';
import {
  buildCorrectiveMenuExtractionPrompt,
  buildMenuExtractionPrompt,
  type MenuExtractionInput,
} from './menu-prompt';
import type { MenuExtractionModelClient } from './menu-model-client';
import { menuModelOutputSchema, type MenuModelOutput } from './menu-schema';
import type { FuelMode } from './types';

export class UnreadableMenuError extends Error {
  /** What the call that found the photo unreadable cost, for the audit row. */
  usage: TokenUsage | null = null;
  constructor() {
    super('menu could not be read');
    this.name = 'UnreadableMenuError';
  }
}

export interface ExtractMenuResult {
  output: MenuModelOutput;
  usage: TokenUsage;
}

// FU-16: no calorie, kilojoule, macronutrient or weight figures, no
// supplements, no health conditions. The prompt asks for this; this guard
// makes it structural, replacing any why or ask that slips through.
const NUTRITION_CLAIM =
  /\b(calori\w*|kcal|kilojoules?|kj|macros?|macronutrients?|\d+\s?g\b|grams? of|supplements?|weigh\w*|diabet\w*|cholesterol|blood (sugar|pressure)|inflammat\w*)\b/i;

const MODE_DEFAULT_WHY: Record<FuelMode, string> = {
  'pre-match': 'Fits a light, familiar night before a match.',
  'post-match': 'A sensible recovery plate after a match.',
  travel: 'Easy to eat after travel.',
  rest: 'A good choice for a rest day.',
  practice: 'A balanced choice for tonight.',
};

export function stripNutritionClaims(output: MenuModelOutput, mode: FuelMode): MenuModelOutput {
  return {
    ...output,
    dishes: output.dishes.map((d) => ({
      ...d,
      why: NUTRITION_CLAIM.test(d.why) ? MODE_DEFAULT_WHY[mode] : d.why,
      asks: d.asks.filter((a) => !NUTRITION_CLAIM.test(a)),
    })),
  };
}

function sumUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

function checkReadable(output: MenuModelOutput, usage: TokenUsage): MenuModelOutput {
  // Section 3's failure behaviour: "no partial picks" from a photo that
  // can't be read. A menu with no dishes at all counts as unreadable too.
  if (!output.readable || output.dishes.length === 0) {
    const err = new UnreadableMenuError();
    err.usage = usage;
    throw err;
  }
  return output;
}

// PRD-07 section 3: one schema-constrained vision call over every page of
// the scan, with exactly one corrective retry (the match-scribe/extract and
// financial/extract-receipt shape). Ranking is not this function's job:
// rankMenu applies the hard rules to what this reads.
export async function extractMenu(
  client: MenuExtractionModelClient,
  input: MenuExtractionInput,
): Promise<ExtractMenuResult> {
  const first = await client.complete(buildMenuExtractionPrompt(input));
  const firstParsed = menuModelOutputSchema.safeParse(first.raw);
  if (firstParsed.success) {
    return {
      output: stripNutritionClaims(checkReadable(firstParsed.data, first.usage), input.mode),
      usage: first.usage,
    };
  }

  const second = await client.complete(
    buildCorrectiveMenuExtractionPrompt(input, firstParsed.error.message),
  );
  const usage = sumUsage(first.usage, second.usage);
  const secondParsed = menuModelOutputSchema.safeParse(second.raw);
  if (secondParsed.success) {
    return {
      output: stripNutritionClaims(checkReadable(secondParsed.data, usage), input.mode),
      usage,
    };
  }

  throw new AgentValidationError(
    `fuel/extract-menu: model output failed schema validation twice: ${secondParsed.error.message}`,
  );
}
