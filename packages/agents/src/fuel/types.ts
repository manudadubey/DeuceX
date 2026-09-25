// Closed vocabularies shared by the dietary profile (packages/db's
// fuel_profiles check constraints), the extractor's "contains" tags and the
// hard filter. Keeping all three closed is what lets FU-7 ("no pick may
// contain an excluded or allergenic ingredient as read") be a set
// intersection in code rather than a model judgement.

export const FUEL_EXCLUSIONS = [
  'pork',
  'beef',
  'lamb',
  'meat',
  'fish',
  'shellfish',
  'alcohol',
] as const;
export type FuelExclusion = (typeof FUEL_EXCLUSIONS)[number];

// The EU's fourteen declarable allergens.
export const FUEL_ALLERGENS = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'tree_nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;
export type FuelAllergen = (typeof FUEL_ALLERGENS)[number];

// What the extractor may say a dish contains: every allergen plus the meat
// and drink kinds an exclusion can name.
export const CONTAINS_TAGS = [
  ...FUEL_ALLERGENS,
  'pork',
  'beef',
  'lamb',
  'poultry',
  'other_meat',
  'alcohol',
] as const;
export type ContainsTag = (typeof CONTAINS_TAGS)[number];

// Dish traits the ranker scores against the week mode (PRD-07 section 7).
export const DISH_TRAITS = [
  'fried',
  'heavy',
  'light',
  'carbohydrate',
  'lean_protein',
  'warm',
  'salty',
  'sweet',
] as const;
export type DishTrait = (typeof DISH_TRAITS)[number];

export const FUEL_MODES = ['pre-match', 'post-match', 'travel', 'rest', 'practice'] as const;
export type FuelMode = (typeof FUEL_MODES)[number];

export type AvoidTag =
  | 'Pork'
  | 'Heavy'
  | 'Fried'
  | 'Allergen'
  | 'Alcohol'
  | 'Late'
  | 'Beef'
  | 'Lamb'
  | 'Meat'
  | 'Fish'
  | 'Shellfish';

export interface DietaryProfile {
  exclusions: FuelExclusion[];
  allergies: FuelAllergen[];
  /** Free-text words ("fish", "chicken"). Only re-rank; never filter. */
  preferences: string[];
}

export const EMPTY_DIETARY_PROFILE: DietaryProfile = {
  exclusions: [],
  allergies: [],
  preferences: [],
};

export interface FuelPick {
  rank: number;
  dishOriginal: string;
  dishEnglish: string;
  why: string;
  asks: string[];
  priceMenu: number | null;
  /** Exact home-currency value; display rounds (PRD-07 section 7). */
  priceHome: number | null;
  flags: Array<'over-budget' | 'ingredients-unread'>;
  /** Home-currency overage when over-budget, exact. */
  overBy: number | null;
}

export interface FuelAvoid {
  dish: string;
  gloss: string;
  reason: string;
  tag: AvoidTag;
  /** True when the reason is the mode rather than a rule ("fine on a rest day"). */
  modeOnly: boolean;
}

export interface MealHistoryEntry {
  city: string | null;
  dishEnglish: string;
  outcome: 'none' | 'worked' | 'flat';
  loggedAt: string;
}
