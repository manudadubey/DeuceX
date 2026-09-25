import { MODE_GUIDANCE } from './mode';
import { CONTAINS_TAGS, DISH_TRAITS, type FuelMode } from './types';

export const MENU_EXTRACTION_PROMPT_VERSION = 'v2';

const SYSTEM_PROMPT = `You read photos of a menu (one or more pages of the same menu) for a professional tennis player deciding what to order tonight.
Report: whether the photos are a readable menu or food shelf at all (readable), the venue name as printed (or null), the venue type (restaurant, room-service, shop, other), the languages printed (ISO 639-1 codes), and the menu currency as ISO 4217 (null if no prices; for a symbol several currencies share, such as a bare $, follow the currency hint below unless the menu itself says otherwise).
List every dish or item, in menu order, once. For each:
- original: the name exactly as printed; english: a short English name; gloss: one short English description.
- price: the number printed, in the menu currency, or null if none.
- ingredientsReadable: false when you cannot tell what is in the dish from the menu and the dish's standard recipe.
- contains: only from this list, and only what the menu states or the dish's standard recipe always includes: ${CONTAINS_TAGS.join(', ')}.
- traits: only from this list: ${DISH_TRAITS.join(', ')}.
- why: one sentence on why the dish would or would not suit tonight, written for the situation below.
- asks: zero to three short things to say to the kitchen, phrased as the player would say them (e.g. "Sauce on the side, please.").
Never give calorie, kilojoule, macronutrient or weight figures, never suggest supplements, never mention health conditions. Never guess an ingredient you cannot read.
Respond only with the JSON object the schema asks for.`;

export interface MenuExtractionPrompt {
  system: string;
  user: string;
  /** data: URIs, one per page. */
  imageDataUrls: string[];
}

export interface MenuExtractionInput {
  imageDataUrls: string[];
  mode: FuelMode;
  /**
   * The currency to assume for an ambiguous symbol: the player's home
   * currency, since without a current tournament that is where they most
   * likely are. Found live: a bare "$" on an Australian menu was read as
   * USD and converted, overstating the price by about 40 percent.
   */
  currencyHint: string;
  /** "Sibiu, ROU" when a current tournament places the player, else null. */
  place: string | null;
}

export function buildMenuExtractionPrompt(input: MenuExtractionInput): MenuExtractionPrompt {
  const pages = input.imageDataUrls.length;
  return {
    system: SYSTEM_PROMPT,
    user: `Tonight: ${MODE_GUIDANCE[input.mode]}\n${input.place ? `The player is in ${input.place}. ` : ''}Currency hint for an ambiguous symbol: ${input.currencyHint}.\nRead ${pages === 1 ? 'this menu page' : `these ${pages} pages of one menu`}.`,
    imageDataUrls: input.imageDataUrls,
  };
}

export function buildCorrectiveMenuExtractionPrompt(
  input: MenuExtractionInput,
  validationError: string,
): MenuExtractionPrompt {
  const base = buildMenuExtractionPrompt(input);
  return {
    ...base,
    user: `${base.user}\n\nYour previous answer did not match the required schema: ${validationError}\nAnswer again, correcting the problem.`,
  };
}
