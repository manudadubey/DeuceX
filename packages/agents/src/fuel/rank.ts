import { LATE_TRAVEL_HOUR } from './mode';
import type { MenuDish, MenuModelOutput } from './menu-schema';
import type {
  AvoidTag,
  ContainsTag,
  DietaryProfile,
  DishTrait,
  FuelAvoid,
  FuelExclusion,
  FuelMode,
  FuelPick,
  MealHistoryEntry,
} from './types';

export const MAX_PICKS = 3;
export const MAX_AVOID = 3;

// FU-8, word for word. A safety line, not copy polish (register C5).
export const ALLERGEN_CONFIRM_LINE =
  'Allergen information is read from the menu and is advisory. Confirm ingredients with the kitchen before ordering.';
export const INGREDIENTS_UNREAD_LINE = "Couldn't read the ingredients: ask before ordering.";
export const FALLBACK_LINE =
  'Nothing appealing? Ask for plain rice or pasta with grilled chicken; most kitchens will do it off-menu.';
export const SAFETY_FOOTER =
  "Not medical advice. For anything beyond tonight's order, an accredited sports dietitian.";
export const UNREADABLE_MESSAGE =
  "Couldn't read that one. Try closer, flatter, or one page at a time.";

// Which contains-tags each exclusion rules out.
const EXCLUSION_TAGS: Record<FuelExclusion, ContainsTag[]> = {
  pork: ['pork'],
  beef: ['beef'],
  lamb: ['lamb'],
  meat: ['pork', 'beef', 'lamb', 'poultry', 'other_meat'],
  fish: ['fish'],
  shellfish: ['crustaceans', 'molluscs'],
  alcohol: ['alcohol'],
};

const EXCLUSION_AVOID_TAG: Record<FuelExclusion, AvoidTag> = {
  pork: 'Pork',
  beef: 'Beef',
  lamb: 'Lamb',
  meat: 'Meat',
  fish: 'Fish',
  shellfish: 'Shellfish',
  alcohol: 'Alcohol',
};

const EXCLUSION_RULE: Record<FuelExclusion, string> = {
  pork: 'no pork',
  beef: 'no beef',
  lamb: 'no lamb',
  meat: 'no meat',
  fish: 'no fish',
  shellfish: 'no shellfish',
  alcohol: 'no alcohol',
};

const ALLERGEN_LABEL: Record<string, string> = {
  tree_nuts: 'tree nuts',
  soybeans: 'soy',
};

// Section 7's per-mode leanings as trait weights. Restricted traits (fried,
// heavy) never score: they route a dish to "Not tonight" instead.
const MODE_TRAIT_WEIGHTS: Record<FuelMode, Partial<Record<DishTrait, number>>> = {
  'pre-match': { carbohydrate: 2, light: 1, lean_protein: 1 },
  'post-match': { lean_protein: 2, salty: 1, warm: 1, carbohydrate: 1 },
  travel: { warm: 2, light: 2 },
  rest: { lean_protein: 1, carbohydrate: 1 },
  practice: { carbohydrate: 1, lean_protein: 1, light: 1 },
};

const FAMILIAR_WORKED_SCORE = 3;
const PREFERENCE_SCORE = 1;
const OVER_BUDGET_PENALTY = 2;

export interface RankInput {
  extraction: MenuModelOutput;
  mode: FuelMode;
  profile: DietaryProfile;
  localHour: number;
  city: string | null;
  history: MealHistoryEntry[];
  /** Units of home currency per one unit of menu currency; null when no rate. */
  rateMenuToHome: number | null;
  /** Home currency left for food today; null when no allowance or no rate. */
  foodMoneyLeft: number | null;
}

export interface RankResult {
  picks: FuelPick[];
  avoid: FuelAvoid[];
  /** FU-4: true when the rules and mode leave fewer than two picks. */
  fewerThanTwo: boolean;
  /** "Last time here: <dish> worked" (section 7's second-visit rule). */
  secondVisit: string | null;
  dishesRead: number;
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ruleHit(
  dish: MenuDish,
  profile: DietaryProfile,
): { tag: AvoidTag; reason: string } | null {
  const contains = new Set(dish.contains);
  for (const allergen of profile.allergies) {
    if (contains.has(allergen)) {
      const label = ALLERGEN_LABEL[allergen] ?? allergen;
      return {
        tag: 'Allergen',
        reason: `Contains ${label}, which is on your allergy list.`,
      };
    }
  }
  for (const exclusion of profile.exclusions) {
    if (EXCLUSION_TAGS[exclusion].some((t) => contains.has(t))) {
      return {
        tag: EXCLUSION_AVOID_TAG[exclusion],
        reason: `Your rule is ${EXCLUSION_RULE[exclusion]}.`,
      };
    }
  }
  return null;
}

function modeHit(
  dish: MenuDish,
  mode: FuelMode,
  localHour: number,
): { tag: AvoidTag; reason: string } | null {
  if (mode === 'rest') return null;
  const traits = new Set(dish.traits);
  const late = mode === 'travel' && localHour >= LATE_TRAVEL_HOUR;
  if (traits.has('fried')) return { tag: 'Fried', reason: 'Fried, and slow to settle tonight.' };
  if (traits.has('heavy')) {
    return late
      ? { tag: 'Late', reason: 'Heavy this late after travel.' }
      : { tag: 'Heavy', reason: 'Heavy and slow to digest tonight.' };
  }
  if (dish.contains.includes('alcohol')) {
    return { tag: 'Alcohol', reason: 'Made with alcohol.' };
  }
  return null;
}

function joinReason(gloss: string, reason: string): string {
  const g = gloss.trim();
  if (!g) return reason;
  return `${g.replace(/[.\s]+$/, '')}. ${reason}`;
}

// PRD-07 section 7's pick ranking, deterministic: the extractor reads and
// describes, this decides. Hard filters first (FU-7), then the mode's
// restrictions, then a score for mode fit, familiarity, preference and price.
export function rankMenu(input: RankInput): RankResult {
  const { extraction, mode, profile } = input;
  const dishes = extraction.dishes;

  const workedHere = input.history
    .filter(
      (h) =>
        h.outcome === 'worked' &&
        h.city !== null &&
        input.city !== null &&
        normalise(h.city) === normalise(input.city),
    )
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const lastWorked = workedHere[0] ?? null;
  const secondVisit = lastWorked ? `Last time here: ${lastWorked.dishEnglish} worked` : null;
  const workedNames = new Set(workedHere.map((h) => normalise(h.dishEnglish)));
  const preferenceWords = input.profile.preferences.map(normalise).filter(Boolean);

  const ruleAvoid: FuelAvoid[] = [];
  const modeAvoid: FuelAvoid[] = [];
  const readable: Array<{ dish: MenuDish; index: number; score: number }> = [];
  const unreadable: Array<{ dish: MenuDish; index: number; score: number }> = [];

  dishes.forEach((dish, index) => {
    const rule = ruleHit(dish, profile);
    if (rule) {
      ruleAvoid.push({
        dish: dish.original,
        gloss: dish.gloss,
        reason: joinReason(dish.gloss, rule.reason),
        tag: rule.tag,
        modeOnly: false,
      });
      return;
    }
    // An unread dish can't be checked against a rule, so it never passes
    // the hard filter on its own merits (section 7); it may only return as
    // a last resort below, with the confirm line leading.
    const modeRestriction = modeHit(dish, mode, input.localHour);
    if (modeRestriction) {
      modeAvoid.push({
        dish: dish.original,
        gloss: dish.gloss,
        reason: joinReason(dish.gloss, modeRestriction.reason),
        tag: modeRestriction.tag,
        modeOnly: true,
      });
      return;
    }

    const weights = MODE_TRAIT_WEIGHTS[mode];
    let score = dish.traits.reduce((sum, t) => sum + (weights[t] ?? 0), 0);
    const english = normalise(dish.english);
    if (workedNames.has(english)) score += FAMILIAR_WORKED_SCORE;
    if (preferenceWords.some((w) => english.includes(w))) score += PREFERENCE_SCORE;
    const priceHome =
      dish.price !== null && input.rateMenuToHome !== null
        ? dish.price * input.rateMenuToHome
        : null;
    if (priceHome !== null && input.foodMoneyLeft !== null && priceHome > input.foodMoneyLeft) {
      score -= OVER_BUDGET_PENALTY;
    }

    (dish.ingredientsReadable ? readable : unreadable).push({ dish, index, score });
  });

  const byScore = (
    a: { score: number; index: number; dish: MenuDish },
    b: { score: number; index: number; dish: MenuDish },
  ) => {
    // Second-visit rule: the city's last Worked dish, if present and passing
    // the filters, is ranked first whatever its score.
    if (lastWorked) {
      const target = normalise(lastWorked.dishEnglish);
      const aHit = normalise(a.dish.english) === target;
      const bHit = normalise(b.dish.english) === target;
      if (aHit !== bHit) return aHit ? -1 : 1;
    }
    return b.score - a.score || a.index - b.index;
  };

  const chosen = [...readable].sort(byScore).slice(0, MAX_PICKS);
  // FU-AC-6: an unread dish becomes a pick only when fewer than two others fit.
  if (chosen.length < 2) {
    chosen.push(...[...unreadable].sort(byScore).slice(0, 2 - chosen.length));
  }

  const picks: FuelPick[] = chosen.map(({ dish }, i) => {
    const priceHome =
      dish.price !== null && input.rateMenuToHome !== null
        ? dish.price * input.rateMenuToHome
        : null;
    const flags: FuelPick['flags'] = [];
    let overBy: number | null = null;
    if (!dish.ingredientsReadable) flags.push('ingredients-unread');
    if (priceHome !== null && input.foodMoneyLeft !== null && priceHome > input.foodMoneyLeft) {
      flags.push('over-budget');
      overBy = priceHome - input.foodMoneyLeft;
    }
    return {
      rank: i + 1,
      dishOriginal: dish.original,
      dishEnglish: dish.english,
      why: dish.ingredientsReadable ? dish.why : `${INGREDIENTS_UNREAD_LINE} ${dish.why}`,
      asks: dish.asks.slice(0, 3),
      priceMenu: dish.price,
      priceHome,
      flags,
      overBy,
    };
  });

  return {
    picks,
    avoid: [...ruleAvoid, ...modeAvoid].slice(0, MAX_AVOID),
    fewerThanTwo: picks.length < 2,
    secondVisit,
    dishesRead: dishes.length,
  };
}
